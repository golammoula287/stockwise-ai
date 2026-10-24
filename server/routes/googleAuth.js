const express = require('express');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { getPrisma } = require('../config/db');
const { getJwtSecret } = require('../middleware/auth');
const { signToken } = require('./auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const googleClient = new OAuth2Client();
const limiter = createRateLimiter({ prefix: 'google-login', windowMs: 15 * 60 * 1000, max: 15 });
const getClientId = () => (process.env.GOOGLE_CLIENT_ID || '').trim();

router.get('/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ configured: Boolean(getClientId()), clientId: getClientId() || null });
});

router.get('/challenge', limiter, (req, res) => {
  if (!getClientId()) return res.status(503).json({ message: 'Google sign-in is not enabled yet.' });
  const nonce = crypto.randomBytes(32).toString('hex');
  const challenge = jwt.sign({ nonce }, getJwtSecret(), { expiresIn: '5m', audience: 'stockwise-google-login' });
  res.set('Cache-Control', 'no-store').json({ nonce, challenge });
});

router.post('/', limiter, async (req, res, next) => {
  if (!getClientId()) return res.status(503).json({ message: 'Google sign-in is not enabled yet.' });
  const expectedOrigin = process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  if (req.get('origin') && req.get('origin') !== expectedOrigin) {
    return res.status(403).json({ message: 'Sign-in origin is not permitted.' });
  }
  if (!req.is('application/json')) return res.status(400).json({ message: 'A JSON sign-in request is required.' });
  const { credential, challenge } = req.body || {};
  if (typeof credential !== 'string' || credential.length > 16000 || typeof challenge !== 'string' || challenge.length > 2000) {
    return res.status(400).json({ message: 'A Google credential and sign-in challenge are required.' });
  }
  let identity;
  try {
    const signed = jwt.verify(challenge, getJwtSecret(), { audience: 'stockwise-google-login', algorithms: ['HS256'] });
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: getClientId() });
    identity = ticket.getPayload();
    if (!identity?.sub || !identity.email || identity.email_verified !== true || !signed.nonce || identity.nonce !== signed.nonce) throw new Error('Invalid identity');
  } catch (_) {
    return res.status(401).json({ message: 'Google sign-in could not be verified. Please try again.' });
  }
  try {
    const prisma = getPrisma();
    let user = await prisma.user.findUnique({ where: { googleSubject: identity.sub } });
    if (!user) {
      // First linking requires an address Google currently controls. A verified
      // third-party mailbox alone does not establish that authority.
      const email = identity.email.toLowerCase().trim();
      const domain = email.split('@')[1];
      if (domain !== 'gmail.com' && !(identity.hd && identity.hd.toLowerCase() === domain)) {
        return res.status(403).json({ message: 'Use your Gmail or Google Workspace account, or sign in with email and password.' });
      }
      user = await prisma.user.findUnique({ where: { email } });
      if (!user || (user.googleSubject && user.googleSubject !== identity.sub)) {
        return res.status(403).json({ message: 'This Google account has not been invited. Contact the demo owner for access.' });
      }
      const linked = await prisma.user.updateMany({ where: { id: user.id, googleSubject: null }, data: { googleSubject: identity.sub } });
      if (!linked.count) {
        const current = await prisma.user.findUnique({ where: { id: user.id } });
        if (current?.googleSubject !== identity.sub) return res.status(403).json({ message: 'This account is linked to another Google identity.' });
      }
    }
    res.set('Cache-Control', 'no-store').json({
      token: signToken(user),
      user: { id: user.id, _id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone || '', businessName: user.businessName || 'StockWise AI' },
    });
  } catch (err) { next(err); }
});

module.exports = router;
