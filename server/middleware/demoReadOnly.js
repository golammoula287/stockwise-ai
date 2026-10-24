function demoReadOnly(req, res, next) {
  if (process.env.DEMO_READ_ONLY !== 'true') return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Account signup/sign-in and read-only assistant queries are allowed; business writes stay blocked.
  if (req.method === 'POST' && ['/auth/login', '/auth/signup', '/auth/signup/', '/auth/google', '/auth/google/', '/chat', '/chat/sandbox', '/chat/sandbox/', '/chat/'].includes(req.path)) {
    return next();
  }
  const deny = () => res.status(403).json({ message: 'This portfolio demo is read-only. Changes are disabled.' });
  if (!req.headers.authorization) return deny();
  // Authenticate before allowing persistent writes; client flags cannot bypass the demo guard.
  return require('./auth').protect(req, res, () => {
    if (req.user.privateWorkspace === true) return next();
    return deny();
  });
}

module.exports = { demoReadOnly };
