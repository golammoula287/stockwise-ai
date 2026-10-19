const jwt = require('jsonwebtoken');
const { getPrisma } = require('../config/db');

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
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: String(decoded.id) },
    });
    if (!user) return res.status(401).json({ message: 'User not found' });
    const { password, ...safeUser } = user;
    req.user = { ...safeUser, _id: user.id };
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

exports.adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};
