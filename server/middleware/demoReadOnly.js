function demoReadOnly(req, res, next) {
  if (process.env.DEMO_READ_ONLY !== 'true') return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Account signup/sign-in and read-only assistant queries are allowed; business writes stay blocked.
  if (req.method === 'POST' && ['/auth/login', '/auth/signup', '/auth/signup/', '/auth/google', '/auth/google/', '/chat', '/chat/sandbox', '/chat/sandbox/', '/chat/'].includes(req.path)) {
    return next();
  }
  return res.status(403).json({ message: 'This portfolio demo is read-only. Changes are disabled.' });
}

module.exports = { demoReadOnly };
