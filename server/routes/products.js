const express = require('express');
const { body, validationResult } = require('express-validator');
const { getPrisma, isValidId, computeProductStatus } = require('../config/db');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/categories', async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const products = await prisma.product.findMany();
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
    const prisma = getPrisma();
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const logs = await prisma.stockLog.findMany({
      include: {
        performedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const { search, category, status, lowStockOnly, page = 1, limit = 10 } = req.query;
    const where = {};

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { category: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
      ];
    }
    if (category && category !== 'All Categories' && category !== 'All') {
      where.category = category;
    }

    const rawProducts = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    let products = rawProducts.map(p => ({
      ...p,
      _id: p.id,
      status: computeProductStatus(p),
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
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    const prisma = getPrisma();
    const p = await prisma.product.findUnique({ where: { id: req.params.id } });
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
    const prisma = getPrisma();

    const doc = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: name.trim(),
          category: category.trim(),
          price: Number(price),
          cost: cost !== undefined && cost !== '' ? Number(cost) : Math.round(Number(price) * 0.75),
          stock: Number(stock),
          lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : 5,
          description: description || null,
          image: image || null,
          sku: sku ? sku.trim() : null,
        },
      });

      await tx.stockLog.create({
        data: {
          productId: created.id,
          productName: created.name,
          category: created.category,
          type: 'initial',
          change: created.stock,
          previousStock: 0,
          newStock: created.stock,
          note: 'Product created',
          performedById: req.user.id,
        },
      });

      return created;
    });

    res.status(201).json({
      ...doc,
      _id: doc.id,
      status: computeProductStatus(doc),
    });
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
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }

    const prisma = getPrisma();
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Product not found' });

    const updateFields = {};
    if (req.body.name !== undefined) updateFields.name = String(req.body.name).trim();
    if (req.body.category !== undefined) updateFields.category = String(req.body.category).trim();
    if (req.body.price !== undefined) updateFields.price = Number(req.body.price);
    if (req.body.cost !== undefined && req.body.cost !== '') updateFields.cost = Number(req.body.cost);
    if (req.body.lowStockThreshold !== undefined) {
      updateFields.lowStockThreshold = Number(req.body.lowStockThreshold);
    }
    if (req.body.description !== undefined) updateFields.description = req.body.description;
    if (req.body.image !== undefined) updateFields.image = req.body.image;
    if (req.body.sku !== undefined) updateFields.sku = req.body.sku || null;

    if (req.body.stock !== undefined) {
      const parsedStock = Number(req.body.stock);
      if (!Number.isInteger(parsedStock) || parsedStock < 0) {
        return res.status(400).json({ message: 'Stock must be a non-negative integer' });
      }
      updateFields.stock = parsedStock;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const prod = await tx.product.update({
        where: { id: req.params.id },
        data: updateFields,
      });

      if (updateFields.stock !== undefined && updateFields.stock !== existing.stock) {
        const diff = prod.stock - existing.stock;
        await tx.stockLog.create({
          data: {
            productId: prod.id,
            productName: prod.name,
            category: prod.category,
            type: diff > 0 ? 'restock' : 'adjustment',
            change: diff,
            previousStock: existing.stock,
            newStock: prod.stock,
            note: req.body.note || 'Manual product edit',
            performedById: req.user.id,
          },
        });
      }

      return prod;
    });

    res.json({
      ...updated,
      _id: updated.id,
      status: computeProductStatus(updated),
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/stock', protect, adminOnly, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    const { delta, note } = req.body;
    if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0) {
      return res.status(400).json({ message: 'Stock adjustment delta must be a non-zero integer' });
    }

    const prisma = getPrisma();
    const productId = req.params.id;

    const result = await prisma.$transaction(async (tx) => {
      // Atomic row-level conditional update in PostgreSQL
      const rows = await tx.$queryRaw`
        UPDATE "products"
        SET "stock" = "stock" + ${delta}, "updatedAt" = NOW()
        WHERE "id" = ${productId} AND ("stock" + ${delta}) >= 0
        RETURNING "id", "name", "sku", "category", "price", "cost", "stock", "lowStockThreshold", "description", "image", "createdAt", "updatedAt";
      `;

      if (!rows || rows.length === 0) {
        const exists = await tx.product.findUnique({ where: { id: productId } });
        if (!exists) {
          const notFound = new Error('Product not found');
          notFound.statusCode = 404;
          throw notFound;
        }
        const negErr = new Error('Stock cannot go negative');
        negErr.statusCode = 400;
        throw negErr;
      }

      const updatedRow = rows[0];
      const newStock = updatedRow.stock;
      const prevStock = newStock - delta;

      await tx.stockLog.create({
        data: {
          productId: updatedRow.id,
          productName: updatedRow.name,
          category: updatedRow.category,
          type: delta > 0 ? 'restock' : 'adjustment',
          change: delta,
          previousStock: prevStock,
          newStock,
          note: note || (delta > 0 ? 'Stock restocked' : 'Stock adjusted'),
          performedById: req.user.id,
        },
      });

      return updatedRow;
    });

    res.json({
      ...result,
      _id: result.id,
      status: computeProductStatus(result),
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
});

router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    const prisma = getPrisma();
    const saleItemCount = await prisma.saleItem.count({
      where: { productId: req.params.id },
    });
    if (saleItemCount > 0) {
      return res.status(400).json({
        message: 'Cannot delete a product with recorded sales history. Adjust its stock to 0 instead.',
      });
    }
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Product not found' });

    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ message: 'Product deleted successfully', id: existing.id, _id: existing.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
