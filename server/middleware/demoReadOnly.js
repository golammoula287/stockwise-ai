function demoReadOnly(req, res, next) {
  if (process.env.DEMO_READ_ONLY !== 'true') return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Login and assistant queries are the only POST requests allowed in a read-only demo.
  if (req.method === 'POST' && ['/auth/login', '/chat', '/chat/'].includes(req.path)) {
    return next();
  }
  return res.status(403).json({ message: 'This portfolio demo is read-only. Changes are disabled.' });
}

module.exports = { demoReadOnly };
