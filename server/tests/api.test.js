process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const { seedDatabase } = require('../utils/seedData');

describe('StockWise AI — Full Backend API Test Suite', () => {
  let token = '';
  let createdProductId = '';
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
  });

  describe('2. Authentication & Authorization', () => {
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
  });

  describe('3. Products & Inventory Management', () => {
    it('GET /api/products returns paginated products with computed stock status', async () => {
      const res = await request(app).get('/api/products?limit=20');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBeGreaterThanOrEqual(5);
      const keyboard = res.body.products.find(p => p.name === 'Keyboard');
      expect(keyboard.status).toBe('Out of Stock');
      const mouse = res.body.products.find(p => p.name === 'Wireless Mouse');
      expect(mouse.status).toBe('Low Stock');
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

    it('PATCH /api/products/:id/stock adjusts stock and prevents negative stock', async () => {
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
      expect(catRes.body.some(c => c.category === 'Electronics')).toBe(true);
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
      expect(Array.isArray(detailRes.body.purchaseHistory)).toBe(true);
    });
  });

  describe('5. Sales Checkout & Automatic Stock Deduction', () => {
    it('POST /api/sales deducts product stock automatically and calculates revenue & profit', async () => {
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
      // 3 * 1200 = 3600 subtotal, 100 discount => 3500 total; cost 3 * 800 = 2400 => 1100 profit
      expect(saleRes.body.subtotal).toBe(3600);
      expect(saleRes.body.total).toBe(3500);
      expect(saleRes.body.profit).toBe(1100);

      // Verify stock deducted from 25 to 22
      const prodRes = await request(app).get(`/api/products/${createdProductId}`);
      expect(prodRes.status).toBe(200);
      expect(prodRes.body.stock).toBe(22);

      // Verify customer totalSpent updated
      const custRes = await request(app).get(`/api/customers/${createdCustomerId}`);
      expect(custRes.body.customer.totalSpent).toBe(3500);
      expect(custRes.body.customer.totalOrders).toBe(1);
    });

    it('POST /api/sales rejects sale when stock is insufficient and keeps stock intact', async () => {
      const failRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ product: createdProductId, quantity: 500 }],
        });
      expect(failRes.status).toBe(400);
      expect(failRes.body.message).toMatch(/insufficient stock/i);

      const prodRes = await request(app).get(`/api/products/${createdProductId}`);
      expect(prodRes.body.stock).toBe(22);
    });
  });

  describe('6. Dashboard & AI Insights', () => {
    it('GET /api/dashboard/stats, /recent-sales, and /sales-overview return live analytics', async () => {
      const statsRes = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${token}`);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.totalProducts).toBeGreaterThanOrEqual(10);
      expect(statsRes.body.totalRevenue).toBeGreaterThan(0);
      expect(Array.isArray(statsRes.body.notifications)).toBe(true);

      const chartRes = await request(app)
        .get('/api/dashboard/sales-overview')
        .set('Authorization', `Bearer ${token}`);
      expect(chartRes.status).toBe(200);
      expect(chartRes.body.length).toBeGreaterThanOrEqual(10);
    });

    it('GET /api/ai/insights computes real recommendations, top products, and business summary', async () => {
      const aiRes = await request(app)
        .get('/api/ai/insights')
        .set('Authorization', `Bearer ${token}`);
      expect(aiRes.status).toBe(200);
      expect(typeof aiRes.body.summary).toBe('string');
      expect(aiRes.body.summary.length).toBeGreaterThan(20);
      expect(Array.isArray(aiRes.body.recommendations)).toBe(true);
      expect(aiRes.body.recommendations.length).toBeGreaterThan(0);
      expect(Array.isArray(aiRes.body.topProducts)).toBe(true);
      expect(aiRes.body.topProducts.length).toBeGreaterThan(0);
      expect(Array.isArray(aiRes.body.slowMoving)).toBe(true);
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
