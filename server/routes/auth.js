const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'dev_secret_change_me', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

router.post('/login', [
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || '01712345678',
        businessName: user.businessName || 'StockPro',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', protect, async (req, res) => {
  res.json(req.user);
});

router.post('/register', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }
    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: role || 'staff',
    });
    res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
