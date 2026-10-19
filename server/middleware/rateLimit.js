/**
 * In-memory sliding-window rate limiter for authentication & sensitive endpoints.
 * Prevents brute-force credential stuffing without requiring external Redis infrastructure.
 */
const buckets = new Map();

function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 15,
  message = 'Too many attempts from this IP, please try again later.',
} = {}) {
  return function rateLimitMiddleware(req, res, next) {
    const maxAllowed = process.env.LOGIN_RATE_LIMIT_MAX
      ? parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10)
      : process.env.NODE_ENV === 'test'
      ? 100
      : max;

    const key = req.ip || req.headers['x-forwarded-for'] || 'global';
    const now = Date.now();
    const record = buckets.get(key);

    if (!record || now > record.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    record.count += 1;
    if (record.count > maxAllowed) {
      const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        message,
        retryAfterSeconds: retryAfterSec,
      });
    }

    return next();
  };
}

function resetRateLimiters() {
  buckets.clear();
}

module.exports = { createRateLimiter, resetRateLimiters };
