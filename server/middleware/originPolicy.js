const corsOptions = {
  origin(origin, callback) {
    const allowed = process.env.CLIENT_URL ||
      (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
    // CLI/server requests have no browser origin. Browser origins require an exact match.
    callback(null, !origin || origin === allowed);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

module.exports = { corsOptions };
