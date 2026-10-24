const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getPrisma } = require('../config/db');
const { protect, getJwtSecret } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const { isSuperAdmin } = require('../utils/superAdmin');
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
          isSuperAdmin: isSuperAdmin(user),
          phone: user.phone || '01712345678',
          businessName: user.businessName || 'StockWise AI',
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

const signupLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5, prefix: 'signup', message: 'Too many registration attempts. Please try again later.' });
router.post('/signup', signupLimiter, [
  body('name').isString().trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2–80 characters'),
  body('email').isEmail().isLength({ max: 254 }).withMessage('Valid email is required'),
  body('password').isString().isLength({ min: 12, max: 72 }).withMessage('Password must be 12–72 characters').custom(value => Buffer.byteLength(value, 'utf8') <= 72),
], async (req, res, next) => {
  // Public registration is restricted to the read-only portfolio environment.
  if (process.env.DEMO_READ_ONLY !== 'true') return res.status(403).json({ message: 'Public registration is available only in the read-only demo.' });
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  try {
    const prisma = getPrisma();
    const email = req.body.email.toLowerCase().trim();
    const password = await bcrypt.hash(req.body.password, 12);
    await prisma.user.create({ data: { name: req.body.name, email, password, role: 'staff' } });
    return res.status(201).json({ message: 'Registration complete. You can now sign in.' });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Unable to register this email. Try signing in or contact the demo owner.' });
    next(err);
  }
});

router.get('/me', protect, async (req, res) => {
  res.json(req.user);
});


module.exports = router;
module.exports.signToken = signToken;
