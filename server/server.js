require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const { corsOptions } = require('./middleware/originPolicy');
const { demoReadOnly } = require('./middleware/demoReadOnly');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const customerRoutes = require('./routes/customers');
const saleRoutes = require('./routes/sales');
const dashboardRoutes = require('./routes/dashboard');
const aiRoutes = require('./routes/ai');
const settingsRoutes = require('./routes/settings');
const chatRoutes = require('./routes/chat');

const app = express();

// Security & CORS Middleware
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '256kb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Explicitly public health endpoints
app.get('/', (req, res) =>
  res.json({ message: 'StockWise AI API', version: '1.0.0', database: 'PostgreSQL + Prisma' })
);
app.get('/api/health', (req, res) =>
  res.json({ ok: true, database: 'postgresql', demoReadOnly: process.env.DEMO_READ_ONLY === 'true', uptime: process.uptime(), timestamp: new Date().toISOString() })
);

app.get('/api/ready', async (req, res) => {
  try {
    const prisma = await connectDB();
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, database: 'postgresql' });
  } catch (_) {
    res.status(503).json({ ok: false, message: 'Database is unavailable' });
  }
});

app.use('/api', demoReadOnly);

// Ensure DB connection before API routes
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/auth/google', require('./routes/googleAuth'));
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/chat', chatRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// Centralized Error Handler (never leaks SQL, credentials, or stack traces)
app.use((err, req, res, next) => {
  if (err.code === 'P2028') {
    return res.status(503).json({ message: 'The database request timed out. Refresh the page before retrying.' });
  }
  if (err.code === 'P2002') {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : String(err.meta?.target || '');
    if (target.toLowerCase().includes('sku')) {
      return res.status(400).json({ message: 'A product with this SKU already exists' });
    }
    if (target.toLowerCase().includes('email')) {
      return res.status(400).json({ message: 'Email address is already in use' });
    }
    if (target.toLowerCase().includes('invoicenumber')) {
      return res.status(409).json({ message: 'Invoice number collision detected, please retry' });
    }
    return res.status(400).json({ message: 'Duplicate field value violates unique constraint' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ message: 'Requested record not found' });
  }
  if (err.code === 'P2003') {
    return res.status(400).json({ message: 'Operation blocked by related historical records' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Malformed JSON request body' });
  }
  const status = err.status || err.statusCode || 500;
  if (process.env.NODE_ENV !== 'test' && status >= 500) {
    console.error('Server error:', err.message);
  }
  const safeMessage =
    status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Server error';
  res.status(status).json({ message: safeMessage });
});

if (require.main === module) {
  const PORT = process.env.PORT || 5001;
  connectDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`StockWise AI API (PostgreSQL + Prisma) running on http://0.0.0.0:${PORT}`);
    });
  }).catch(() => {
    console.error('Database connection failed; check server environment configuration.');
    process.exitCode = 1;
  });
}

module.exports = app;
