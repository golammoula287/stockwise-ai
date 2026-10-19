process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/stockwise_test?schema=public';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const { seedDatabase } = require('../utils/seedData');
const { getJwtSecret } = require('../middleware/auth');
const { resetRateLimiters } = require('../middleware/rateLimit');
const {
  fitHoltDemandModel,
  computeCalibratedStockoutProbability,
} = require('../utils/aiInsights');
const {
  pluralize,
  formatCount,
  formatUnits,
  formatItems,
  formatSignedUnits,
  calculateInvoiceFinancials,
} = require('../utils/formatters');

describe('StockWise AI — Comprehensive Security, PostgreSQL, Tax Persistence & AI Verification Suite', () => {
  let adminToken = '';
  let staffToken = '';
  let testMouseId = '';
  let zeroStockProductId = '';
  let createdCustomerId = '';

  beforeAll(async () => {
    await connectDB();
    await seedDatabase({ force: true });
    resetRateLimiters();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('1. Health & PostgreSQL Configuration', () => {
    it('GET /api/health returns ok status and postgresql database engine', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.database).toBe('postgresql');
    });

    it('requires DATABASE_URL when running in production environment', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevUrl = process.env.DATABASE_URL;
      try {
        await disconnectDB();
        process.env.NODE_ENV = 'production';
        delete process.env.DATABASE_URL;
        await expect(connectDB()).rejects.toThrow(/DATABASE_URL/i);
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevUrl) process.env.DATABASE_URL = prevUrl;
        await connectDB();
      }
    });
  });

  describe('2. Authentication, Rate Limiting & API Security (IMP-08, IMP-09, IMP-10, IMP-14)', () => {
    it('rejects unauthenticated requests to all protected GET/POST endpoints with 401 (IMP-08, IMP-09, IMP-10)', async () => {
      const endpoints = [
        '/api/products',
        '/api/products/categories',
        '/api/products/stock-history',
        '/api/sales',
        '/api/customers',
        '/api/dashboard/stats',
        '/api/dashboard/notifications',
        '/api/ai/insights',
        '/api/settings',
      ];
      for (const ep of endpoints) {
        const res = await request(app).get(ep);
        expect(res.status).toBe(401);
      }
    });

    it('rejects malformed and invalid JWT tokens on GET /api/products, /api/sales, and /api/customers with 401 (IMP-14)', async () => {
      const badToken = 'Bearer invalid.jwt.token.signature';
      const prodRes = await request(app).get('/api/products').set('Authorization', badToken);
      expect(prodRes.status).toBe(401);

      const salesRes = await request(app).get('/api/sales').set('Authorization', badToken);
      expect(salesRes.status).toBe(401);

      const custRes = await request(app).get('/api/customers').set('Authorization', badToken);
      expect(custRes.status).toBe(401);
    });

    it('POST /api/auth/login validates missing fields (400) and rejects wrong credentials (401)', async () => {
      const emptyRes = await request(app).post('/api/auth/login').send({});
      expect(emptyRes.status).toBe(400);

      const wrongRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@stockwise.com', password: 'wrongpassword' });
      expect(wrongRes.status).toBe(401);
      expect(wrongRes.body.message).toMatch(/invalid/i);
    });

    it('POST /api/auth/login authenticates valid admin user and returns JWT', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@stockwise.com', password: 'admin123' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('admin@stockwise.com');
      adminToken = res.body.token;
    });

    it('rejects expired JWT tokens with 401', async () => {
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(meRes.status).toBe(200);

      const expiredToken = jwt.sign(
        { id: meRes.body.id, role: 'admin' },
        getJwtSecret(),
        { expiresIn: '-10s' }
      );
      const expRes = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(expRes.status).toBe(401);
      expect(expRes.body.message).toMatch(/expired/i);
    });

    it('enforces role-based authorization (403 Forbidden) when staff user attempts admin-only actions', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Staff Cashier',
          email: 'staff@stockwise.com',
          password: 'staffpassword123',
          role: 'staff',
        });
      expect(regRes.status).toBe(201);

      const loginStaff = await request(app)
        .post('/api/auth/login')
        .send({ email: 'staff@stockwise.com', password: 'staffpassword123' });
      expect(loginStaff.status).toBe(200);
      staffToken = loginStaff.body.token;

      // Staff can read products
      const readRes = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(readRes.status).toBe(200);

      // Staff cannot create, update, adjust stock, or delete products (403)
      const createProdRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Unauthorized Item', category: 'Accessories', price: 500, stock: 5 });
      expect(createProdRes.status).toBe(403);
    });

    it('enforces login rate limiting (429 Too Many Requests) under brute-force attempts', async () => {
      const prevMax = process.env.LOGIN_RATE_LIMIT_MAX;
      process.env.LOGIN_RATE_LIMIT_MAX = '3';
      resetRateLimiters();
      try {
        for (let i = 0; i < 3; i++) {
          await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@stockwise.com', password: 'bad' });
        }
        const blockedRes = await request(app)
          .post('/api/auth/login')
          .send({ email: 'admin@stockwise.com', password: 'bad' });
        expect(blockedRes.status).toBe(429);
        expect(blockedRes.body.message).toMatch(/too many/i);
      } finally {
        if (prevMax) process.env.LOGIN_RATE_LIMIT_MAX = prevMax;
        else delete process.env.LOGIN_RATE_LIMIT_MAX;
        resetRateLimiters();
      }
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

  describe('3. Product Lifecycle, SKU Uniqueness & Inventory Audit (IMP-11, IMP-13)', () => {
    it('GET /api/products returns paginated products with computed stock status and SKUs', async () => {
      const res = await request(app)
        .get('/api/products?limit=20')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.products)).toBe(true);
      const keyboard = res.body.products.find(p => p.name === 'Keyboard');
      expect(keyboard.status).toBe('Out of Stock');
      expect(keyboard.sku).toBe('KB-003');
      zeroStockProductId = keyboard._id;
    });

    it('GET /api/products/:id rejects malformed non-UUID identifier (400)', async () => {
      const res = await request(app)
        .get('/api/products/not-a-valid-uuid')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid product id/i);
    });

    it('POST /api/products rejects negative prices, negative costs, negative stock, and empty names (400)', async () => {
      const badPrice = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bad Product', category: 'Accessories', price: -10, stock: 5 });
      expect(badPrice.status).toBe(400);

      const badCost = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bad Cost', category: 'Accessories', price: 100, cost: -5, stock: 5 });
      expect(badCost.status).toBe(400);

      const badStock = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bad Stock', category: 'Accessories', price: 100, stock: -1 });
      expect(badStock.status).toBe(400);
    });

    it('verifies full Test Mouse lifecycle (create 20 -> sale 5 -> restock +10 -> adjust -5 -> reject -25 with no log) and SKU uniqueness (IMP-11, IMP-13)', async () => {
      // 1. Create Test Mouse with 20 units and unique SKU TM-001
      const createRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Mouse',
          sku: 'TM-001',
          category: 'Accessories',
          price: 1000,
          cost: 600,
          stock: 20,
          lowStockThreshold: 5,
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.name).toBe('Test Mouse');
      expect(createRes.body.sku).toBe('TM-001');
      expect(createRes.body.stock).toBe(20);
      testMouseId = createRes.body._id;

      // Verify duplicate SKU is rejected with 400 (IMP-11)
      const dupSkuRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Another Mouse',
          sku: 'tm-001',
          category: 'Accessories',
          price: 1200,
          stock: 10,
        });
      expect(dupSkuRes.status).toBe(400);
      expect(dupSkuRes.body.message).toMatch(/SKU/i);

      // 2. Sale of 5 units: stock 20 -> 15
      const sale5Res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product: testMouseId, quantity: 5 }],
          paymentMethod: 'cash',
        });
      expect(sale5Res.status).toBe(201);
      const afterSale = await request(app)
        .get(`/api/products/${testMouseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(afterSale.body.stock).toBe(15);

      // 3. Restock +10: stock 15 -> 25
      const restockRes = await request(app)
        .patch(`/api/products/${testMouseId}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ delta: 10, note: 'Restock shipment' });
      expect(restockRes.status).toBe(200);
      expect(restockRes.body.stock).toBe(25);

      // 4. Adjustment -5: stock 25 -> 20 (even if caller left note as 'Restock', backend normalizes note for IMP-13)
      const adjustRes = await request(app)
        .patch(`/api/products/${testMouseId}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ delta: -5, note: 'Restock' });
      expect(adjustRes.status).toBe(200);
      expect(adjustRes.body.stock).toBe(20);

      // Count stock logs for Test Mouse before invalid adjustment
      const logsBeforeRes = await request(app)
        .get(`/api/products/stock-history?productId=${testMouseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(logsBeforeRes.status).toBe(200);
      const logCountBefore = logsBeforeRes.body.length;
      expect(logCountBefore).toBe(4); // initial(20), sale(-5), restock(+10), adjustment(-5)
      // Verify the -5 adjustment log does NOT have misleading 'Restock' note (IMP-13)
      const latestLog = logsBeforeRes.body[0];
      expect(latestLog.type).toBe('adjustment');
      expect(latestLog.change).toBe(-5);
      expect(latestLog.note).not.toMatch(/^restock$/i);

      // 5. Invalid adjustment -25 (20 - 25 = -5) is rejected with 400 and produces NO stock log
      const invalidAdjRes = await request(app)
        .patch(`/api/products/${testMouseId}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ delta: -25, note: 'Excessive deduction' });
      expect(invalidAdjRes.status).toBe(400);
      expect(invalidAdjRes.body.message).toMatch(/negative/i);

      const logsAfterRes = await request(app)
        .get(`/api/products/stock-history?productId=${testMouseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(logsAfterRes.body.length).toBe(logCountBefore);
    });
  });

  describe('4. Customers CRUD & Purchase History Consistency (IMP-06)', () => {
    it('keeps Nusrat Jahan order count and total spending 100% consistent with her purchase history invoices (IMP-06)', async () => {
      const listRes = await request(app)
        .get('/api/customers?search=Nusrat')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      const nusrat = listRes.body.find(c => c.name === 'Nusrat Jahan');
      expect(nusrat).toBeDefined();

      const detailRes = await request(app)
        .get(`/api/customers/${nusrat._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.purchaseHistory.length).toBe(detailRes.body.customer.totalOrders);
      const sumInvoices = detailRes.body.purchaseHistory.reduce((s, inv) => s + inv.total, 0);
      expect(detailRes.body.customer.totalSpent).toBe(sumInvoices);
    });

    it('POST /api/customers creates a customer and GET /api/customers/:id returns history', async () => {
      const createRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Tanvir Ahmed',
          phone: '01799998888',
          email: 'tanvir@example.com',
          address: 'Sylhet',
        });
      expect(createRes.status).toBe(201);
      createdCustomerId = createRes.body._id;

      const detailRes = await request(app)
        .get(`/api/customers/${createdCustomerId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.customer.name).toBe('Tanvir Ahmed');
    });
  });

  describe('5. PostgreSQL Sales Transaction Integrity, Tax Persistence, Rollback & Concurrency (IMP-16)', () => {
    it('POST /api/sales deducts product stock atomically and persists taxRate & taxAmount with discount (IMP-16)', async () => {
      // 3 units of Test Mouse (price 1000, cost 600) => subtotal 3000, cost 1800
      // discount 100 => taxableAmount 2900, 5% tax => taxAmount 145, total 3045, profit 2900 - 1800 = 1100
      const saleRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: createdCustomerId,
          items: [{ product: testMouseId, quantity: 3 }],
          discount: 100,
          taxRate: 5,
          paymentMethod: 'cash',
        });
      expect(saleRes.status).toBe(201);
      expect(saleRes.body.subtotal).toBe(3000);
      expect(saleRes.body.discount).toBe(100);
      expect(saleRes.body.taxableAmount).toBe(2900);
      expect(saleRes.body.taxRate).toBe(5);
      expect(saleRes.body.taxAmount).toBe(145);
      expect(saleRes.body.tax).toBe(145);
      expect(saleRes.body.total).toBe(3045);
      expect(saleRes.body.profit).toBe(1100);
      expect(saleRes.body.isLegacyTax).toBe(false);
      expect(saleRes.body.invoiceNumber).toMatch(/^INV-\d+$/);

      // Verify persisted taxRate and taxAmount on GET /api/sales/:id
      const getSaleRes = await request(app)
        .get(`/api/sales/${saleRes.body._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getSaleRes.status).toBe(200);
      expect(getSaleRes.body.taxRate).toBe(5);
      expect(getSaleRes.body.taxAmount).toBe(145);
      expect(getSaleRes.body.total).toBe(3045);

      const prodRes = await request(app)
        .get(`/api/products/${testMouseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(prodRes.body.stock).toBe(17);

      const custRes = await request(app)
        .get(`/api/customers/${createdCustomerId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(custRes.body.customer.totalSpent).toBe(3045);
      expect(custRes.body.customer.totalOrders).toBe(1);
    });

    it('preserves historical invoice tax snapshots when Business Settings taxRate changes later and supports zero tax & legacy null state (IMP-16)', async () => {
      // 1. Set Business Settings taxRate to 5%
      await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ taxRate: 5 });

      // 2. Create Sale A (1 unit of Test Mouse = 1000, cost = 600, no explicit taxRate in payload -> snapshots 5% from Settings)
      // Matches verified example: Subtotal BDT 1,000, Discount BDT 0, Applied tax 5% (50), Total BDT 1,050, Profit BDT 400
      const saleARes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product: testMouseId, quantity: 1 }],
          paymentMethod: 'cash',
        });
      expect(saleARes.status).toBe(201);
      expect(saleARes.body.subtotal).toBe(1000);
      expect(saleARes.body.discount).toBe(0);
      expect(saleARes.body.taxRate).toBe(5);
      expect(saleARes.body.taxAmount).toBe(50);
      expect(saleARes.body.total).toBe(1050);
      expect(saleARes.body.profit).toBe(400);

      // 3. Change Business Settings taxRate to 12.5%
      await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ taxRate: 12.5 });

      // 4. Create Sale B with explicit zero tax (taxRate: 0)
      const saleZeroTax = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product: testMouseId, quantity: 1 }],
          taxRate: 0,
          paymentMethod: 'card',
        });
      expect(saleZeroTax.status).toBe(201);
      expect(saleZeroTax.body.taxRate).toBe(0);
      expect(saleZeroTax.body.taxAmount).toBe(0);
      expect(saleZeroTax.body.total).toBe(1000);
      expect(saleZeroTax.body.profit).toBe(400);

      // 5. Re-fetch Sale A and verify its persisted 5% tax snapshot did NOT change when Settings changed to 12.5%
      const checkSaleA = await request(app)
        .get(`/api/sales/${saleARes.body._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(checkSaleA.status).toBe(200);
      expect(checkSaleA.body.taxRate).toBe(5);
      expect(checkSaleA.body.taxAmount).toBe(50);
      expect(checkSaleA.body.total).toBe(1050);
      expect(checkSaleA.body.profit).toBe(400);

      // 6. Verify pre-migration legacy seeded invoices retain null taxRate & taxAmount (no fabricated tax)
      const allSalesRes = await request(app)
        .get('/api/sales?search=INV-1001')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(allSalesRes.status).toBe(200);
      const legacyInv = allSalesRes.body.sales.find(s => s.invoiceNumber === 'INV-1001');
      expect(legacyInv).toBeDefined();
      expect(legacyInv.taxRate).toBeNull();
      expect(legacyInv.taxAmount).toBeNull();
      expect(legacyInv.isLegacyTax).toBe(true);

      // Reset Settings taxRate to 0 and restock Test Mouse by +2 back to 17 for subsequent tests
      await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ taxRate: 0 });
      await request(app)
        .patch(`/api/products/${testMouseId}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ delta: 2, note: 'Restore stock after tax snapshot test' });
    });

    it('POST /api/sales merges duplicate product entries in a single request', async () => {
      const saleRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: createdCustomerId,
          items: [
            { product: testMouseId, quantity: 1 },
            { product: testMouseId, quantity: 1 },
          ],
          paymentMethod: 'card',
        });
      expect(saleRes.status).toBe(201);
      expect(saleRes.body.items.length).toBe(1);
      expect(saleRes.body.items[0].quantity).toBe(2);

      const prodRes = await request(app)
        .get(`/api/products/${testMouseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(prodRes.body.stock).toBe(15);
    });

    it('POST /api/sales rejects invalid quantity, excessive discount, invalid taxRate, and invalid paymentMethod', async () => {
      const badQty = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ product: testMouseId, quantity: 1.5 }] });
      expect(badQty.status).toBe(400);

      const badPay = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ product: testMouseId, quantity: 1 }], paymentMethod: 'crypto' });
      expect(badPay.status).toBe(400);

      const badTaxNeg = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ product: testMouseId, quantity: 1 }], taxRate: -5 });
      expect(badTaxNeg.status).toBe(400);

      const badTaxOver = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ product: testMouseId, quantity: 1 }], taxRate: 150 });
      expect(badTaxOver.status).toBe(400);

      const badDiscount = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ product: testMouseId, quantity: 1 }], discount: 999999 });
      expect(badDiscount.status).toBe(400);
      expect(badDiscount.body.message).toMatch(/discount/i);

      // Verify PostgreSQL transaction rolled back stock to 15 after rejected discount
      const prodRes = await request(app)
        .get(`/api/products/${testMouseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(prodRes.body.stock).toBe(15);
    });

    it('POST /api/sales rolls back the entire PostgreSQL transaction when a second item has insufficient stock', async () => {
      const failRes = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: createdCustomerId,
          items: [
            { product: testMouseId, quantity: 5 },
            { product: zeroStockProductId, quantity: 2 },
          ],
        });
      expect(failRes.status).toBe(400);
      expect(failRes.body.message).toMatch(/insufficient stock/i);

      // Verify first item's stock was rolled back to 15 and customer orders stayed 2
      const prodRes = await request(app)
        .get(`/api/products/${testMouseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(prodRes.body.stock).toBe(15);

      const custRes = await request(app)
        .get(`/api/customers/${createdCustomerId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(custRes.body.customer.totalOrders).toBe(2);
    });

    it('POST /api/sales handles concurrent checkouts safely without negative stock or duplicate invoices', async () => {
      const limitedRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Limited Edition GPU',
          sku: 'GPU-099',
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
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ items: [{ product: gpuId, quantity: 4 }] }),
        request(app)
          .post('/api/sales')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ items: [{ product: gpuId, quantity: 4 }] }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 400]);

      const afterGpu = await request(app)
        .get(`/api/products/${gpuId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(afterGpu.body.stock).toBe(1);
    });

    it('DELETE /api/products/:id blocks deleting a product that has recorded sales history', async () => {
      const delRes = await request(app)
        .delete(`/api/products/${testMouseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(400);
      expect(delRes.body.message).toMatch(/sales history/i);
    });
  });

  describe('6. Dashboard Date Filtering, AI/ML Demand Forecasting & Formatting Utilities (IMP-01, IMP-02, IMP-03, IMP-05, IMP-15)', () => {
    it('formats singular/plural units, items, and monetary values accurately (IMP-15 & IMP-16)', () => {
      expect(pluralize(0, 'unit')).toBe('units');
      expect(pluralize(1, 'unit')).toBe('unit');
      expect(pluralize(2, 'unit')).toBe('units');
      expect(formatUnits(0)).toBe('0 units');
      expect(formatUnits(1)).toBe('1 unit');
      expect(formatUnits(2)).toBe('2 units');
      expect(formatUnits(1, '~')).toBe('~1 unit');
      expect(formatUnits(2, '~')).toBe('~2 units');
      expect(formatItems(0)).toBe('0 items');
      expect(formatItems(1)).toBe('1 item');
      expect(formatItems(2)).toBe('2 items');
      expect(formatSignedUnits(1)).toBe('+1 unit');
      expect(formatSignedUnits(-1)).toBe('-1 unit');
      expect(formatSignedUnits(10)).toBe('+10 units');
      expect(formatCount(4, 'product is', 'products are')).toBe('4 products are');

      const fin = calculateInvoiceFinancials({
        subtotal: 1000,
        discount: 0,
        totalCost: 600,
        taxRate: 5,
      });
      expect(fin).toEqual({
        subtotal: 1000,
        discount: 0,
        taxableAmount: 1000,
        taxRate: 5,
        taxAmount: 50,
        total: 1050,
        totalCost: 600,
        profit: 400,
      });
    });

    it('GET /api/dashboard/stats and /sales-overview support dateFilter & range without fake baseline numbers (IMP-05)', async () => {
      const statsMonth = await request(app)
        .get('/api/dashboard/stats?dateFilter=This%20Month')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(statsMonth.status).toBe(200);
      expect(statsMonth.body.totalProducts).toBeGreaterThanOrEqual(8);
      expect(statsMonth.body.totalRevenue).toBeGreaterThan(0);

      const chartYear = await request(app)
        .get('/api/dashboard/sales-overview?range=This%20Year')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(chartYear.status).toBe(200);
      expect(chartYear.body.length).toBe(12);

      const chartMonth = await request(app)
        .get('/api/dashboard/sales-overview?range=This%20Month')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(chartMonth.status).toBe(200);
      expect(chartMonth.body.length).toBe(10);
    });

    it('calibrates stockout probability accurately for zero-demand (IMP-01), parity (IMP-02), and sparse series', async () => {
      const zeroDemandProb = computeCalibratedStockoutProbability({
        stock: 3,
        forecast14dContinuous: 0,
        horizonSigma: 0.75,
        sold30: 0,
      });
      expect(zeroDemandProb).toBeLessThanOrEqual(15);

      const parityProb = computeCalibratedStockoutProbability({
        stock: 15,
        forecast14dContinuous: 15,
        horizonSigma: 4.0,
        sold30: 30,
      });
      expect(parityProb).toBe(50);

      const decliningSeries = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const fitDeclining = fitHoltDemandModel(decliningSeries, 14);
      expect(fitDeclining.forecast14dContinuous).toBeGreaterThanOrEqual(0);
      expect(fitDeclining.forecast14d).toBeGreaterThanOrEqual(0);
    });

    it('GET /api/ai/insights computes calibrated Holt demand forecasts, separates threshold vs forecast triggers (IMP-03), and avoids "1 units" grammar bugs (IMP-15)', async () => {
      const aiRes = await request(app)
        .get('/api/ai/insights')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(aiRes.status).toBe(200);
      expect(typeof aiRes.body.summary).toBe('string');
      expect(aiRes.body.recommendationState).toBe('enabled');
      expect(aiRes.body.modelEvaluation).toBeDefined();
      expect(typeof aiRes.body.modelEvaluation.maeModel).toBe('number');
      expect(typeof aiRes.body.modelEvaluation.maeBaseline).toBe('number');
      expect(Array.isArray(aiRes.body.modelEvaluation.assumptionsAndLimitations)).toBe(true);
      expect(typeof aiRes.body.thresholdAlertCount).toBe('number');
      expect(typeof aiRes.body.forecastReorderCount).toBe('number');

      const usbHub = aiRes.body.recommendations.find(r => r.product === 'USB-C Hub');
      expect(usbHub).toBeDefined();
      expect(usbHub.forecast14d).toBe(0);
      expect(usbHub.stockoutProbability).toBeLessThan(20);
      expect(usbHub.triggerType).toBe('threshold');

      // Ensure no recommendation text contains "1 units" or "~1 units" (IMP-15)
      for (const rec of aiRes.body.recommendations) {
        expect(rec.explainability).not.toMatch(/\b1 units\b/);
        expect(rec.explainability).not.toMatch(/~1 units\b/);
        expect(rec.reason).not.toMatch(/\b1 units\b/);
      }
    });
  });

  describe('7. Business Settings, Disabled AI Summary & Disabled Notification States (IMP-07, IMP-17, IMP-18)', () => {
    it('correctly separates actual low-stock counts from disabled AI suggestions (IMP-17) and disabled notifications (IMP-18)', async () => {
      // Disable lowStockAlerts and autoReorderSuggestions
      const putRes = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'John Doe',
          phone: '01712345678',
          businessName: 'StockWise AI Enterprise',
          taxRate: 5,
          preferences: {
            lowStockAlerts: false,
            autoReorderSuggestions: false,
          },
        });
      expect(putRes.status).toBe(200);
      expect(putRes.body.business.name).toBe('StockWise AI Enterprise');
      expect(putRes.body.business.taxRate).toBe(5);

      // Verify IMP-18: GET /api/dashboard/notifications distinguishes disabled state from "All products are well stocked"
      const notifDisabled = await request(app)
        .get('/api/dashboard/notifications')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(notifDisabled.status).toBe(200);
      expect(notifDisabled.body.alertsEnabled).toBe(false);
      expect(notifDisabled.body.status).toBe('disabled');
      expect(notifDisabled.body.message).toBe('Low-stock notifications are disabled in Preferences.');
      expect(notifDisabled.body.lowStockCount).toBeGreaterThan(0);
      expect(notifDisabled.body.notifications).toEqual([]);

      // Verify Dashboard stats lowStockCount remains independent of notification preference
      const statsRes = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.lowStockCount).toBe(notifDisabled.body.lowStockCount);
      expect(statsRes.body.lowStockAlertsEnabled).toBe(false);
      expect(statsRes.body.notificationsStatus).toBe('disabled');
      expect(statsRes.body.notificationsMessage).toBe('Low-stock notifications are disabled in Preferences.');

      // Verify IMP-17: GET /api/ai/insights keeps actual thresholdAlertCount accurate while reporting disabled recommendations
      const aiDisabled = await request(app)
        .get('/api/ai/insights')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(aiDisabled.status).toBe(200);
      expect(aiDisabled.body.autoReorderEnabled).toBe(false);
      expect(aiDisabled.body.recommendationState).toBe('disabled');
      expect(aiDisabled.body.recommendations).toEqual([]);
      expect(aiDisabled.body.enabledRecommendationCount).toBe(0);
      expect(aiDisabled.body.lowStockCount).toBeGreaterThan(0);
      expect(aiDisabled.body.thresholdAlertCount).toBe(aiDisabled.body.lowStockCount);
      expect(aiDisabled.body.disabledMessage).toMatch(
        /products are below their low-stock thresholds\. Automated reorder recommendations are disabled in Preferences\./
      );
      expect(aiDisabled.body.summary).toContain(aiDisabled.body.disabledMessage);

      // Re-enable preferences and verify active states
      await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          preferences: {
            lowStockAlerts: true,
            autoReorderSuggestions: true,
          },
        });

      const notifEnabled = await request(app)
        .get('/api/dashboard/notifications')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(notifEnabled.status).toBe(200);
      expect(notifEnabled.body.alertsEnabled).toBe(true);
      expect(notifEnabled.body.status).toBe('active');
      expect(notifEnabled.body.notifications.length).toBeGreaterThan(0);
      // Verify IMP-15 in notification messages (e.g. Limited Edition GPU has 1 unit left -> "1 unit left", not "1 units left")
      for (const n of notifEnabled.body.notifications) {
        expect(n.message).not.toMatch(/\b1 units\b/);
      }
    });
  });
});
