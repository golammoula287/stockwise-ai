const jwt = require('jsonwebtoken');
const { getPrisma, isValidId } = require('../config/db');

function getJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) {
    return process.env.JWT_SECRET.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be configured in production');
  }
  return 'dev_test_jwt_secret_stockwise';
}

exports.getJwtSecret = getJwtSecret;

exports.protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string' || !/^Bearer\s+/i.test(header)) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (!decoded || !decoded.id || !isValidId(String(decoded.id))) {
      return res.status(401).json({ message: 'Not authorized, invalid token payload' });
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: String(decoded.id) },
    });
    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user no longer exists' });
    }

    const { password, ...safeUser } = user;
    req.user = { ...safeUser, _id: user.id };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Not authorized, token has expired' });
    }
    return res.status(401).json({ message: 'Not authorized, token failed verification' });
  }
};

exports.adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized, authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden: Admin access required' });
  }
  next();
};
