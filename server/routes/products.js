const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const StockLog = require('../models/StockLog');
const Sale = require('../models/Sale');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

function computeStatus(p) {
  const threshold = p.lowStockThreshold ?? 5;
  if (p.stock === 0) return 'Out of Stock';
  if (p.stock <= threshold) return 'Low Stock';
  return 'In Stock';
}

router.get('/categories', async (req, res, next) => {
  try {
    const products = await Product.find().lean();
    const map = {};
    for (const p of products) {
      const cat = p.category || 'Uncategorized';
      if (!map[cat]) {
        map[cat] = { category: cat, count: 0, totalStock: 0, totalValue: 0, lowStockCount: 0 };
      }
      map[cat].count += 1;
      map[cat].totalStock += p.stock || 0;
      map[cat].totalValue += (p.price || 0) * (p.stock || 0);
      if (p.stock <= (p.lowStockThreshold ?? 5)) {
        map[cat].lowStockCount += 1;
      }
    }
    res.json(Object.values(map));
  } catch (err) {
    next(err);
  }
});

router.get('/stock-history', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const logs = await StockLog.find()
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { search, category, status, lowStockOnly, page = 1, limit = 10 } = req.query;
    const q = {};
    if (search && search.trim()) {
      q.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { category: { $regex: search.trim(), $options: 'i' } },
        { sku: { $regex: search.trim(), $options: 'i' } },
      ];
    }
    if (category && category !== 'All Categories' && category !== 'All') {
      q.category = category;
    }

    const rawProducts = await Product.find(q).sort({ createdAt: 1 }).lean();
    let products = rawProducts.map(p => ({
      ...p,
      status: computeStatus(p),
    }));

    if (lowStockOnly === 'true') {
      products = products.filter(p => p.stock <= (p.lowStockThreshold ?? 5));
    } else if (status && status !== 'All Status' && status !== 'All') {
      products = products.filter(p => p.status === status);
    }

    const total = products.length;
    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.max(parseInt(limit, 10) || 10, 1);
    const paginated = products.slice((p - 1) * l, p * l);

    res.json({
      products: paginated,
      total,
      page: p,
      pages: Math.max(Math.ceil(total / l), 1),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Product not found' });
    res.json(p);
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, adminOnly, [
  body('name').notEmpty().trim().withMessage('Product name is required'),
  body('category').notEmpty().trim().withMessage('Category is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a non-negative number'),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  body('lowStockThreshold').optional().isInt({ min: 0 }).withMessage('Low-stock threshold must be an integer >= 0'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }
    const { name, category, price, cost, stock, lowStockThreshold, description, image, sku } = req.body;
    const doc = await Product.create({
      name: name.trim(),
      category: category.trim(),
      price: Number(price),
      cost: cost !== undefined && cost !== '' ? Number(cost) : Math.round(Number(price) * 0.75),
      stock: Number(stock),
      lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : 5,
      description,
      image,
      sku: sku || undefined,
    });

    await StockLog.create({
      product: doc._id,
      productName: doc.name,
      category: doc.category,
      type: 'initial',
      change: doc.stock,
      previousStock: 0,
      newStock: doc.stock,
      note: 'Product created',
      performedBy: req.user._id,
    });

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', protect, adminOnly, [
  body('name').optional().notEmpty().trim().withMessage('Product name cannot be empty'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be >= 0'),
  body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be an integer >= 0'),
  body('lowStockThreshold').optional().isInt({ min: 0 }).withMessage('Threshold must be an integer >= 0'),
], async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }

    const updateFields = {};
    const allowed = ['name', 'category', 'price', 'cost', 'stock', 'lowStockThreshold', 'description', 'image', 'sku'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updateFields[key] = req.body[key];
      }
    }
    if (updateFields.stock !== undefined) {
      const parsedStock = Number(updateFields.stock);
      if (!Number.isInteger(parsedStock) || parsedStock < 0) {
        return res.status(400).json({ message: 'Stock must be a non-negative integer' });
      }
      updateFields.stock = parsedStock;
    }

    const beforeDoc = await Product.findOneAndUpdate(
      { _id: req.params.id },
      { $set: updateFields },
      { new: false, runValidators: true }
    );
    if (!beforeDoc) return res.status(404).json({ message: 'Product not found' });

    const updated = await Product.findById(req.params.id);

    if (updateFields.stock !== undefined && updateFields.stock !== beforeDoc.stock) {
      const diff = updated.stock - beforeDoc.stock;
      await StockLog.create({
        product: updated._id,
        productName: updated.name,
        category: updated.category,
        type: diff > 0 ? 'restock' : 'adjustment',
        change: diff,
        previousStock: beforeDoc.stock,
        newStock: updated.stock,
        note: req.body.note || 'Manual product edit',
        performedBy: req.user._id,
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/stock', protect, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    const { delta, note } = req.body;
    if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0) {
      return res.status(400).json({ message: 'Stock adjustment delta must be a non-zero integer' });
    }

    const filter = delta < 0
      ? { _id: req.params.id, stock: { $gte: Math.abs(delta) } }
      : { _id: req.params.id };

    const beforeDoc = await Product.findOneAndUpdate(
      filter,
      { $inc: { stock: delta } },
      { new: false }
    );

    if (!beforeDoc) {
      const exists = await Product.exists({ _id: req.params.id });
      if (!exists) return res.status(404).json({ message: 'Product not found' });
      return res.status(400).json({ message: 'Stock cannot go negative' });
    }

    const prevStock = beforeDoc.stock;
    const newStock = prevStock + delta;

    await StockLog.create({
      product: beforeDoc._id,
      productName: beforeDoc.name,
      category: beforeDoc.category,
      type: delta > 0 ? 'restock' : 'adjustment',
      change: delta,
      previousStock: prevStock,
      newStock,
      note: note || (delta > 0 ? 'Stock restocked' : 'Stock adjusted'),
      performedBy: req.user._id,
    });

    const updated = await Product.findById(req.params.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    const hasSales = await Sale.exists({ 'items.product': req.params.id });
    if (hasSales) {
      return res.status(400).json({
        message: 'Cannot delete a product with recorded sales history. Adjust its stock to 0 instead.',
      });
    }
    const del = await Product.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ message: 'Product not found' });
    await StockLog.deleteMany({ product: del._id });
    res.json({ message: 'Product deleted successfully', id: del._id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
