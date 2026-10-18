const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const StockLog = require('../models/StockLog');
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
    const { search, category, status, page = 1, limit = 10 } = req.query;
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

    if (status && status !== 'All Status' && status !== 'All') {
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
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }
    const { name, category, price, cost, stock, lowStockThreshold, description, image, sku } = req.body;
    const doc = await Product.create({
      name,
      category,
      price: Number(price),
      cost: cost !== undefined ? Number(cost) : Math.round(Number(price) * 0.75),
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
], async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }
    const existing = await Product.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Product not found' });

    const prevStock = existing.stock;
    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

    if (req.body.stock !== undefined && Number(req.body.stock) !== prevStock) {
      const diff = updated.stock - prevStock;
      await StockLog.create({
        product: updated._id,
        productName: updated.name,
        category: updated.category,
        type: diff > 0 ? 'restock' : 'adjustment',
        change: diff,
        previousStock: prevStock,
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
    if (typeof delta !== 'number' || Number.isNaN(delta) || delta === 0) {
      return res.status(400).json({ message: 'Non-zero numeric delta is required' });
    }
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const prevStock = product.stock;
    const newStock = prevStock + delta;
    if (newStock < 0) {
      return res.status(400).json({ message: 'Stock cannot go negative' });
    }
    product.stock = newStock;
    await product.save();

    await StockLog.create({
      product: product._id,
      productName: product.name,
      category: product.category,
      type: delta > 0 ? 'restock' : 'adjustment',
      change: delta,
      previousStock: prevStock,
      newStock,
      note: note || (delta > 0 ? 'Stock restocked' : 'Stock adjusted'),
      performedBy: req.user._id,
    });

    res.json(product);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    const del = await Product.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted successfully', id: del._id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
