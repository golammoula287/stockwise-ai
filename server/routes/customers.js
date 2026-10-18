const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    const q = {};
    if (search && search.trim()) {
      q.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { phone: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } },
      ];
    }
    const customers = await Customer.find(q).sort({ createdAt: -1 }).limit(100);
    res.json(customers);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    const cust = await Customer.findById(req.params.id);
    if (!cust) return res.status(404).json({ message: 'Customer not found' });
    const sales = await Sale.find({ customer: cust._id }).sort({ createdAt: -1 }).limit(25);
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
    const cust = await Customer.create({
      name: name.trim(),
      email: email ? email.trim().toLowerCase() : undefined,
      phone: phone.trim(),
      address: address ? address.trim() : '',
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }
    const updated = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Customer not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', protect, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    const deleted = await Customer.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Customer not found' });
    res.json({ message: 'Customer deleted', id: deleted._id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
