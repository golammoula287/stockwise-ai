const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getPrisma } = require('../config/db');
const { protect, adminOnly, getJwtSecret } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many login attempts. Please wait 15 minutes before trying again.',
});

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Valid email address is required'),
    body('password').isString().notEmpty().withMessage('Password is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
      }
      const { email, password } = req.body;
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({
        where: { email: String(email).toLowerCase().trim() },
      });
      if (!user) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      const match = await bcrypt.compare(String(password), user.password);
      if (!match) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      const token = signToken(user);
      res.json({
        token,
        user: {
          id: user.id,
          _id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone || '01712345678',
          businessName: user.businessName || 'StockWise AI',
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/me', protect, async (req, res) => {
  res.json(req.user);
});

router.post(
  '/register',
  protect,
  adminOnly,
  [
    body('name').notEmpty().trim().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
      }
      const { name, email, password, role } = req.body;
      const prisma = getPrisma();
      const normalizedEmail = String(email).toLowerCase().trim();
      const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (exists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
      const hashedPassword = await bcrypt.hash(String(password), rounds);
      const user = await prisma.user.create({
        data: {
          name: String(name).trim(),
          email: normalizedEmail,
          password: hashedPassword,
          role: role === 'admin' ? 'admin' : 'staff',
        },
      });
      res.status(201).json({
        id: user.id,
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
module.exports.signToken = signToken;
