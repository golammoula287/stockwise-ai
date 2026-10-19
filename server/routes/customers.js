const express = require('express');
const { body, validationResult } = require('express-validator');
const { getPrisma, isValidId } = require('../config/db');
const { protect } = require('../middleware/auth');

const router = express.Router();

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
    res.json(customers);
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

    const sales = await prisma.sale.findMany({
      where: { customerId: cust.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    res.json({ customer: cust, purchaseHistory: sales });
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, [
  body('name').notEmpty().trim().withMessage('Customer name is required'),
  body('phone').notEmpty().trim().withMessage('Phone number is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }
    const { name, email, phone, address } = req.body;
    const prisma = getPrisma();
    const cust = await prisma.customer.create({
      data: {
        name: name.trim(),
        email: email ? email.trim().toLowerCase() : null,
        phone: phone.trim(),
        address: address ? address.trim() : '',
      },
    });
    res.status(201).json(cust);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', protect, [
  body('name').optional().notEmpty().trim().withMessage('Customer name cannot be empty'),
  body('phone').optional().notEmpty().trim().withMessage('Phone number cannot be empty'),
], async (req, res, next) => {
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
    if (req.body.email !== undefined) data.email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
    if (req.body.address !== undefined) data.address = req.body.address;

    const updated = await prisma.customer.update({
      where: { id: req.params.id },
      data,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', protect, async (req, res, next) => {
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
