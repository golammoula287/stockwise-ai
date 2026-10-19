process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const { seedDatabase } = require('../utils/seedData');
const { getJwtSecret } = require('../middleware/auth');

describe('StockWise AI — Comprehensive Backend & Transaction Verification Suite', () => {
  let token = '';
  let createdProductId = '';
  let zeroStockProductId = '';
  let createdCustomerId = '';

  beforeAll(async () => {
    await connectDB();
    await seedDatabase({ force: true });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('1. Health & Base Routes', () => {
    it('GET /api/health returns ok status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('requires persistent MONGO_URI when outside test mode and USE_IN_MEMORY_DB is not enabled', async () => {
      const mongoose = require('mongoose');
      const prevEnv = process.env.NODE_ENV;
      const prevUri = process.env.MONGO_URI;
      const prevMem = process.env.USE_IN_MEMORY_DB;
      try {
        await disconnectDB();
        process.env.NODE_ENV = 'production';
        delete process.env.MONGO_URI;
        process.env.USE_IN_MEMORY_DB = 'false';
        await expect(connectDB()).rejects.toThrow(/MONGO_URI/i);
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevUri) process.env.MONGO_URI = prevUri;
        if (prevMem) process.env.USE_IN_MEMORY_DB = prevMem;
        else delete process.env.USE_IN_MEMORY_DB;
        if (mongoose.connection.readyState === 0) {
          await connectDB();
          await seedDatabase({ force: true });
        }
      }
    });
  });

  describe('2. Authentication & Security', () => {
    it('POST /api/auth/login validates missing fields (400)', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toBeDefined();
    });

    it('POST /api/auth/login rejects invalid credentials (401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@stockwise.com', password: 'wrongpassword' });
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid/i);
    });

    it('POST /api/auth/login authenticates valid admin user and returns JWT', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@stockwise.com', password: 'admin123' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('admin@stockwise.com');
      token = res.body.token;
    });

    it('GET /api/auth/me rejects unauthenticated request (401)', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('GET /api/auth/me returns current authenticated user', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('admin@stockwise.com');
    });

    it('enforces JWT_SECRET in production environment', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.JWT_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.JWT_SECRET;
        expect(() => getJwtSecret()).toThrow(/JWT_SECRET/i);
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevSecret) process.env.JWT_SECRET = prevSecret;
      }
    });
  });

  describe('3. Products & Stock Consistency', () => {
    it('GET /api/products returns paginated products with computed stock status', async () => {
      const res = await request(app).get('/api/products?limit=20');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.products)).toBe(true);
      const keyboard = res.body.products.find(p => p.name === 'Keyboard');
      expect(keyboard.status).toBe('Out of Stock');
      zeroStockProductId = keyboard._id;
    });

    it('POST /api/products validates invalid product input (400)', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '', price: -10, stock: -1 });
      expect(res.status).toBe(400);
    });

    it('POST /api/products creates a new product in the database', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Gaming Mousepad',
          category: 'Accessories',
          price: 1200,
          cost: 800,
          stock: 20,
          lowStockThreshold: 5,
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Gaming Mousepad');
      expect(res.body.stock).toBe(20);
      createdProductId = res.body._id;
    });

    it('PATCH /api/products/:id/stock rejects non-integer and negative-resulting stock adjustments', async () => {
      const floatRes = await request(app)
        .patch(`/api/products/${createdProductId}/stock`)
        .set('Authorization', `Bearer ${token}`)
        .send({ delta: 1.5, note: 'Fractional adjustment' });
      expect(floatRes.status).toBe(400);
      expect(floatRes.body.message).toMatch(/integer/i);

      const okRes = await request(app)
        .patch(`/api/products/${createdProductId}/stock`)
        .set('Authorization', `Bearer ${token}`)
        .send({ delta: 5, note: 'Restock shipment' });
      expect(okRes.status).toBe(200);
      expect(okRes.body.stock).toBe(25);

      const badRes = await request(app)
        .patch(`/api/products/${createdProductId}/stock`)
        .set('Authorization', `Bearer ${token}`)
        .send({ delta: -100 });
      expect(badRes.status).toBe(400);
      expect(badRes.body.message).toMatch(/negative/i);
    });

    it('GET /api/products/stock-history and /categories return inventory metadata', async () => {
      const histRes = await request(app).get('/api/products/stock-history');
      expect(histRes.status).toBe(200);
      expect(Array.isArray(histRes.body)).toBe(true);
      expect(histRes.body.length).toBeGreaterThan(0);

      const catRes = await request(app).get('/api/products/categories');
      expect(catRes.status).toBe(200);
      expect(Array.isArray(catRes.body)).toBe(true);
    });
  });

  describe('4. Customers CRUD', () => {
    it('POST /api/customers creates a customer and GET /api/customers/:id returns history', async () => {
      const createRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Tanvir Ahmed',
          phone: '01799998888',
          email: 'tanvir@example.com',
          address: 'Sylhet',
        });
      expect(createRes.status).toBe(201);
      createdCustomerId = createRes.body._id;

      const detailRes = await request(app).get(`/api/customers/${createdCustomerId}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.customer.name).toBe('Tanvir Ahmed');
    });
  });

  describe('5. Sales Transaction Integrity, Rollback & Concurrency', () => {
    it('POST /api/sales deducts product stock atomically and calculates revenue & profit', async () => {
      const saleRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customer: createdCustomerId,
          items: [{ product: createdProductId, quantity: 3 }],
          discount: 100,
          paymentMethod: 'cash',
        });
      expect(saleRes.status).toBe(201);
      expect(saleRes.body.subtotal).toBe(3600);
      expect(saleRes.body.total).toBe(3500);
      expect(saleRes.body.profit).toBe(1100);
      expect(saleRes.body.invoiceNumber).toMatch(/^INV-\d+$/);

      const prodRes = await request(app).get(`/api/products/${createdProductId}`);
      expect(prodRes.body.stock).toBe(22);

      const custRes = await request(app).get(`/api/customers/${createdCustomerId}`);
      expect(custRes.body.customer.totalSpent).toBe(3500);
      expect(custRes.body.customer.totalOrders).toBe(1);
    });

    it('POST /api/sales merges duplicate product entries in a single request', async () => {
      const saleRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customer: createdCustomerId,
          items: [
            { product: createdProductId, quantity: 1 },
            { product: createdProductId, quantity: 1 },
          ],
          paymentMethod: 'card',
        });
      expect(saleRes.status).toBe(201);
      expect(saleRes.body.items.length).toBe(1);
      expect(saleRes.body.items[0].quantity).toBe(2);

      const prodRes = await request(app).get(`/api/products/${createdProductId}`);
      expect(prodRes.body.stock).toBe(20);
    });

    it('POST /api/sales rejects invalid quantity, excessive discount, and invalid paymentMethod', async () => {
      const badQty = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ product: createdProductId, quantity: 1.5 }] });
      expect(badQty.status).toBe(400);

      const badPay = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ product: createdProductId, quantity: 1 }], paymentMethod: 'crypto' });
      expect(badPay.status).toBe(400);

      const badDiscount = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ product: createdProductId, quantity: 1 }], discount: 999999 });
      expect(badDiscount.status).toBe(400);
      expect(badDiscount.body.message).toMatch(/discount/i);

      // Verify stock remained 20 after rejected discount
      const prodRes = await request(app).get(`/api/products/${createdProductId}`);
      expect(prodRes.body.stock).toBe(20);
    });

    it('POST /api/sales rolls back the entire transaction when a second item has insufficient stock', async () => {
      const failRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customer: createdCustomerId,
          items: [
            { product: createdProductId, quantity: 5 },
            { product: zeroStockProductId, quantity: 2 },
          ],
        });
      expect(failRes.status).toBe(400);
      expect(failRes.body.message).toMatch(/insufficient stock/i);

      // Verify first item's stock was rolled back to 20 and customer orders stayed 2
      const prodRes = await request(app).get(`/api/products/${createdProductId}`);
      expect(prodRes.body.stock).toBe(20);

      const custRes = await request(app).get(`/api/customers/${createdCustomerId}`);
      expect(custRes.body.customer.totalOrders).toBe(2);
    });

    it('POST /api/sales handles concurrent checkouts safely without negative stock or duplicate invoices', async () => {
      const limitedRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Limited Edition GPU',
          category: 'Electronics',
          price: 50000,
          cost: 42000,
          stock: 5,
          lowStockThreshold: 2,
        });
      const gpuId = limitedRes.body._id;

      // Fire two concurrent requests each trying to buy 4 units out of 5
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/sales')
          .set('Authorization', `Bearer ${token}`)
          .send({ items: [{ product: gpuId, quantity: 4 }] }),
        request(app)
          .post('/api/sales')
          .set('Authorization', `Bearer ${token}`)
          .send({ items: [{ product: gpuId, quantity: 4 }] }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 400]);

      const afterGpu = await request(app).get(`/api/products/${gpuId}`);
      expect(afterGpu.body.stock).toBe(1);
    });

    it('DELETE /api/products/:id blocks deleting a product that has recorded sales history', async () => {
      const delRes = await request(app)
        .delete(`/api/products/${createdProductId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(delRes.status).toBe(400);
      expect(delRes.body.message).toMatch(/sales history/i);
    });
  });

  describe('6. Dashboard & AI/ML Demand Forecasting Verification', () => {
    it('GET /api/dashboard/stats, /recent-sales, and /sales-overview return live analytics', async () => {
      const statsRes = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${token}`);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.totalProducts).toBeGreaterThanOrEqual(10);
      expect(statsRes.body.totalRevenue).toBeGreaterThan(0);

      const chartRes = await request(app)
        .get('/api/dashboard/sales-overview')
        .set('Authorization', `Bearer ${token}`);
      expect(chartRes.status).toBe(200);
      expect(chartRes.body.length).toBeGreaterThanOrEqual(10);
    });

    it('GET /api/ai/insights computes Holt time-series demand forecasts, stockout risk, and baseline MAE evaluation', async () => {
      const aiRes = await request(app)
        .get('/api/ai/insights')
        .set('Authorization', `Bearer ${token}`);
      expect(aiRes.status).toBe(200);
      expect(typeof aiRes.body.summary).toBe('string');
      expect(aiRes.body.modelEvaluation).toBeDefined();
      expect(typeof aiRes.body.modelEvaluation.maeModel).toBe('number');
      expect(typeof aiRes.body.modelEvaluation.maeBaseline).toBe('number');
      expect(Array.isArray(aiRes.body.recommendations)).toBe(true);
      expect(aiRes.body.recommendations.length).toBeGreaterThan(0);

      const firstRec = aiRes.body.recommendations[0];
      expect(typeof firstRec.forecast14d).toBe('number');
      expect(firstRec.stockoutProbability).toBeGreaterThanOrEqual(1);
      expect(firstRec.stockoutProbability).toBeLessThanOrEqual(99);
      expect(typeof firstRec.explainability).toBe('string');
    });
  });

  describe('7. Business Settings & Password Update', () => {
    it('GET & PUT /api/settings persist profile and business preferences', async () => {
      const putRes = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'John Doe',
          phone: '01712345678',
          businessName: 'StockPro Enterprise',
          taxRate: 5,
        });
      expect(putRes.status).toBe(200);
      expect(putRes.body.business.name).toBe('StockPro Enterprise');
      expect(putRes.body.business.taxRate).toBe(5);
    });
  });
});
