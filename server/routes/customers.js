const express = require('express');
const { body, validationResult } = require('express-validator');
const { getPrisma, isValidId } = require('../config/db');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// All customer endpoints require authentication (IMP-10)
router.use(protect);

const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;

/**
 * Reconciles customer.totalOrders and customer.totalSpent with actual Sale rows in PostgreSQL
 * so displayed order counts and total spending always match the customer's invoice history (IMP-06).
 */
async function reconcileCustomersWithSales(prisma, customers) {
  if (!customers || customers.length === 0) return [];
  const ids = customers.map(c => c.id);
  const groups = await prisma.sale.groupBy({
    by: ['customerId'],
    where: { customerId: { in: ids } },
    _count: { _all: true },
    _sum: { total: true },
  });

  const statsByCustomerId = new Map();
  for (const g of groups) {
    if (g.customerId) {
      statsByCustomerId.set(g.customerId, {
        orders: g._count._all || 0,
        spent: Math.round(Number(g._sum.total || 0) * 100) / 100,
      });
    }
  }

  const reconciled = [];
  for (const c of customers) {
    const actual = statsByCustomerId.get(c.id) || { orders: 0, spent: 0 };
    if (c.totalOrders !== actual.orders || Math.abs((c.totalSpent || 0) - actual.spent) > 0.01) {
      const updated = await prisma.customer.update({
        where: { id: c.id },
        data: {
          totalOrders: actual.orders,
          totalSpent: actual.spent,
        },
      });
      reconciled.push(updated);
    } else {
      reconciled.push(c);
    }
  }
  return reconciled;
}

router.get('/', async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const { search } = req.query;
    const where = {};
    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }
    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const reconciled = await reconcileCustomersWithSales(prisma, customers);
    res.json(reconciled);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    const prisma = getPrisma();
    const cust = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!cust) return res.status(404).json({ message: 'Customer not found' });

    const [reconciledList, sales] = await Promise.all([
      reconcileCustomersWithSales(prisma, [cust]),
      prisma.sale.findMany({
        where: { customerId: cust.id },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    res.json({
      customer: reconciledList[0] || cust,
      purchaseHistory: sales,
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  [
    body('name').notEmpty().trim().withMessage('Customer name is required').isLength({ max: 120 }),
    body('phone')
      .notEmpty()
      .trim()
      .withMessage('Phone number is required')
      .matches(PHONE_REGEX)
      .withMessage('Valid phone number is required (7-20 digits)'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
      }
      const { name, email, phone, address } = req.body;
      const prisma = getPrisma();
      const cust = await prisma.customer.create({
        data: {
          name: String(name).trim(),
          email: email ? String(email).trim().toLowerCase() : null,
          phone: String(phone).trim(),
          address: address ? String(address).trim() : '',
        },
      });
      res.status(201).json(cust);
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/:id',
  [
    body('name').optional().notEmpty().trim().withMessage('Customer name cannot be empty').isLength({ max: 120 }),
    body('phone')
      .optional()
      .notEmpty()
      .trim()
      .withMessage('Phone number cannot be empty')
      .matches(PHONE_REGEX)
      .withMessage('Valid phone number is required'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email required'),
  ],
  async (req, res, next) => {
    try {
      if (!isValidId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid customer ID' });
      }
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
      }
      const prisma = getPrisma();
      const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ message: 'Customer not found' });

      const data = {};
      if (req.body.name !== undefined) data.name = String(req.body.name).trim();
      if (req.body.phone !== undefined) data.phone = String(req.body.phone).trim();
      if (req.body.email !== undefined) {
        data.email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
      }
      if (req.body.address !== undefined) data.address = String(req.body.address).trim();

      const updated = await prisma.customer.update({
        where: { id: req.params.id },
        data,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    const prisma = getPrisma();
    const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Customer not found' });

    await prisma.customer.delete({ where: { id: req.params.id } });
    res.json({ message: 'Customer deleted', id: existing.id, _id: existing.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
