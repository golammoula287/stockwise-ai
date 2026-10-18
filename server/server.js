require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const customerRoutes = require('./routes/customers');
const saleRoutes = require('./routes/sales');
const dashboardRoutes = require('./routes/dashboard');
const aiRoutes = require('./routes/ai');
const settingsRoutes = require('./routes/settings');

const app = express();

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Health endpoints (no DB dependency required)
app.get('/', (req, res) => res.json({ message: 'StockWise AI API', version: '1.0.0' }));
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() }));

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
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/settings', settingsRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// Centralized Error Handler
app.use((err, req, res, next) => {
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid resource ID format' });
  }
  if (err.code === 11000) {
    return res.status(400).json({ message: 'Duplicate field value entered' });
  }
  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled error:', err.message);
  }
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`StockWise API running on http://0.0.0.0:${PORT}`);
    });
  });
}

module.exports = app;
