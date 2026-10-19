const express = require('express');
const { body, validationResult } = require('express-validator');
const { getPrisma, isValidId, computeProductStatus } = require('../config/db');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// All product & inventory endpoints require authentication (IMP-08, IMP-14)
router.use(protect);

const MAX_MONETARY_VALUE = 100_000_000;
const MAX_STOCK_VALUE = 10_000_000;
const SKU_REGEX = /^[A-Za-z0-9._-]+$/;

function roundCurrency(value) {
  return Math.round(Number(value) * 100) / 100;
}

function normalizeSku(rawSku) {
  if (rawSku === undefined || rawSku === null) return null;
  const trimmed = String(rawSku).trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

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
      map[cat].totalValue = roundCurrency(map[cat].totalValue + (p.price || 0) * (p.stock || 0));
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
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200);
    const where = {};
    if (req.query.productId && isValidId(String(req.query.productId))) {
      where.productId = String(req.query.productId);
    }
    if (req.query.type && ['initial', 'sale', 'restock', 'adjustment'].includes(String(req.query.type))) {
      where.type = String(req.query.type);
    }
    const logs = await prisma.stockLog.findMany({
      where,
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
    const { search, category, status, lowStockOnly, sortBy, page = 1, limit = 10 } = req.query;
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

    let orderBy = { createdAt: 'asc' };
    if (sortBy === 'name') orderBy = { name: 'asc' };
    else if (sortBy === 'price_asc') orderBy = { price: 'asc' };
    else if (sortBy === 'price_desc') orderBy = { price: 'desc' };
    else if (sortBy === 'stock_asc') orderBy = { stock: 'asc' };
    else if (sortBy === 'stock_desc') orderBy = { stock: 'desc' };
    else if (sortBy === 'newest') orderBy = { createdAt: 'desc' };

    const rawProducts = await prisma.product.findMany({
      where,
      orderBy,
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
    const l = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 200);
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

router.post(
  '/',
  adminOnly,
  [
    body('name').notEmpty().trim().withMessage('Product name is required').isLength({ max: 120 }).withMessage('Product name cannot exceed 120 characters'),
    body('category').notEmpty().trim().withMessage('Category is required').isLength({ max: 60 }).withMessage('Category cannot exceed 60 characters'),
    body('price').isFloat({ min: 0, max: MAX_MONETARY_VALUE }).withMessage(`Price must be between 0 and ${MAX_MONETARY_VALUE}`),
    body('cost').optional({ values: 'falsy' }).isFloat({ min: 0, max: MAX_MONETARY_VALUE }).withMessage(`Cost must be between 0 and ${MAX_MONETARY_VALUE}`),
    body('stock').isInt({ min: 0, max: MAX_STOCK_VALUE }).withMessage(`Stock must be an integer between 0 and ${MAX_STOCK_VALUE}`),
    body('lowStockThreshold').optional({ values: 'falsy' }).isInt({ min: 0, max: MAX_STOCK_VALUE }).withMessage('Low-stock threshold must be a non-negative integer'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
      }
      const { name, category, price, cost, stock, lowStockThreshold, description, image, sku } = req.body;

      if (cost !== undefined && cost !== null && cost !== '' && Number(cost) < 0) {
        return res.status(400).json({ message: 'Cost must be a non-negative number' });
      }

      const normalizedSku = normalizeSku(sku);
      if (normalizedSku) {
        if (normalizedSku.length > 64 || !SKU_REGEX.test(normalizedSku)) {
          return res.status(400).json({
            message: 'SKU may only contain letters, numbers, hyphens, underscores, and periods (max 64 chars)',
          });
        }
      }

      const prisma = getPrisma();

      if (normalizedSku) {
        const duplicateSku = await prisma.product.findFirst({
          where: { sku: { equals: normalizedSku, mode: 'insensitive' } },
        });
        if (duplicateSku) {
          return res.status(400).json({ message: `A product with SKU "${normalizedSku}" already exists` });
        }
      }

      // Use business setting default low-stock threshold if not explicitly specified
      let resolvedThreshold = 5;
      if (lowStockThreshold !== undefined && lowStockThreshold !== null && lowStockThreshold !== '') {
        resolvedThreshold = Number(lowStockThreshold);
      } else {
        const setting = await prisma.setting.findFirst({ where: { userId: req.user.id } });
        if (setting && typeof setting.lowStockThresholdDefault === 'number') {
          resolvedThreshold = setting.lowStockThresholdDefault;
        }
      }

      const cleanPrice = roundCurrency(price);
      const cleanCost =
        cost !== undefined && cost !== null && cost !== ''
          ? roundCurrency(cost)
          : roundCurrency(cleanPrice * 0.75);

      const doc = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            name: String(name).trim(),
            category: String(category).trim(),
            price: cleanPrice,
            cost: cleanCost,
            stock: Number(stock),
            lowStockThreshold: resolvedThreshold,
            description: description ? String(description).trim() : null,
            image: image || null,
            sku: normalizedSku,
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
            note: `Initial stock on product creation${created.sku ? ` (${created.sku})` : ''}`,
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
  }
);

router.put(
  '/:id',
  adminOnly,
  [
    body('name').optional().notEmpty().trim().withMessage('Product name cannot be empty').isLength({ max: 120 }),
    body('category').optional().notEmpty().trim().withMessage('Category cannot be empty').isLength({ max: 60 }),
    body('price').optional().isFloat({ min: 0, max: MAX_MONETARY_VALUE }).withMessage('Price must be >= 0'),
    body('cost').optional({ values: 'falsy' }).isFloat({ min: 0, max: MAX_MONETARY_VALUE }).withMessage('Cost must be >= 0'),
    body('stock').optional().isInt({ min: 0, max: MAX_STOCK_VALUE }).withMessage('Stock must be an integer >= 0'),
    body('lowStockThreshold').optional().isInt({ min: 0, max: MAX_STOCK_VALUE }).withMessage('Threshold must be an integer >= 0'),
  ],
  async (req, res, next) => {
    try {
      if (!isValidId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid product ID' });
      }
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
      }

      if (req.body.cost !== undefined && req.body.cost !== null && req.body.cost !== '' && Number(req.body.cost) < 0) {
        return res.status(400).json({ message: 'Cost must be a non-negative number' });
      }

      const prisma = getPrisma();
      const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ message: 'Product not found' });

      const updateFields = {};
      if (req.body.name !== undefined) updateFields.name = String(req.body.name).trim();
      if (req.body.category !== undefined) updateFields.category = String(req.body.category).trim();
      if (req.body.price !== undefined) updateFields.price = roundCurrency(req.body.price);
      if (req.body.cost !== undefined && req.body.cost !== '') updateFields.cost = roundCurrency(req.body.cost);
      if (req.body.lowStockThreshold !== undefined) {
        updateFields.lowStockThreshold = Number(req.body.lowStockThreshold);
      }
      if (req.body.description !== undefined) {
        updateFields.description = req.body.description ? String(req.body.description).trim() : null;
      }
      if (req.body.image !== undefined) updateFields.image = req.body.image;

      if (req.body.sku !== undefined) {
        const normalizedSku = normalizeSku(req.body.sku);
        if (normalizedSku) {
          if (normalizedSku.length > 64 || !SKU_REGEX.test(normalizedSku)) {
            return res.status(400).json({
              message: 'SKU may only contain letters, numbers, hyphens, underscores, and periods (max 64 chars)',
            });
          }
          const duplicateSku = await prisma.product.findFirst({
            where: {
              sku: { equals: normalizedSku, mode: 'insensitive' },
              NOT: { id: req.params.id },
            },
          });
          if (duplicateSku) {
            return res.status(400).json({ message: `A product with SKU "${normalizedSku}" already exists` });
          }
        }
        updateFields.sku = normalizedSku;
      }

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
              note:
                req.body.note && String(req.body.note).trim()
                  ? String(req.body.note).trim()
                  : diff > 0
                  ? `Stock increased via product edit (+${diff})`
                  : `Stock reduced via product edit (${diff})`,
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
  }
);

router.patch('/:id/stock', adminOnly, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    const { delta, note } = req.body;
    if (
      typeof delta !== 'number' ||
      !Number.isInteger(delta) ||
      delta === 0 ||
      Math.abs(delta) > MAX_STOCK_VALUE
    ) {
      return res.status(400).json({ message: 'Stock adjustment delta must be a non-zero integer' });
    }

    // Resolve an accurate, non-misleading audit note (IMP-13)
    const rawNote = typeof note === 'string' ? note.trim() : '';
    let resolvedNote = rawNote;
    if (!resolvedNote) {
      resolvedNote = delta > 0 ? `Stock restock (+${delta})` : `Manual stock adjustment (${delta})`;
    } else if (delta < 0 && /^restock(\s+shipment)?$/i.test(resolvedNote)) {
      // Prevent misleading "Restock" label when a negative adjustment is submitted
      resolvedNote = `Manual stock adjustment (${delta})`;
    } else if (delta > 0 && /^manual\s+stock\s+(deduction|adjustment)/i.test(resolvedNote)) {
      resolvedNote = `Stock restock (+${delta})`;
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
        const negErr = new Error(
          `Stock cannot go negative (current stock: ${exists.stock}, requested change: ${delta})`
        );
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
          note: resolvedNote,
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

router.delete('/:id', adminOnly, async (req, res, next) => {
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
