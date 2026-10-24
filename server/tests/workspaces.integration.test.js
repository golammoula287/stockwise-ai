// CI/disposable PostgreSQL only. Never run this against the portfolio Neon database.
process.env.NODE_ENV = 'test';
require('dotenv').config();
process.env.DATABASE_URL = require('../utils/testDatabase').validateTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const request = require('supertest');
const { randomUUID } = require('node:crypto');
const app = require('../server');
const { getPrisma, disconnectDB } = require('../config/db');
const { workspaceContext } = require('../utils/workspaceScope');
const { executeApprovedChatTool } = require('../utils/chatTools');
const { resetRateLimiters } = require('../middleware/rateLimit');
const originalDemo = process.env.DEMO_READ_ONLY;
const originalOwner = process.env.SUPER_ADMIN_EMAIL;
const password = 'Disposable-workspace-test-123';
let a, b, demo, owner, staff, productA, productB, customerA, saleA;
const send = (method, path, user, body) => request(app)[method](`/api${path}`).set('Authorization', `Bearer ${user.token}`).send(body);

beforeAll(async () => {
  process.env.DEMO_READ_ONLY = 'true';
  resetRateLimiters();
  for (const label of ['a', 'b']) {
    const email = `${label}-${randomUUID()}@example.com`;
    expect((await request(app).post('/api/auth/signup').send({ name: `Owner ${label}`, email, password, privateWorkspace: false })).status).toBe(201);
    const login = await request(app).post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.user.privateWorkspace).toBe(true);
    expect(login.body.user.isSuperAdmin).toBe(false);
    if (label === 'a') a = login.body; else b = login.body;
  }
  const user = await getPrisma().user.create({ data: { name: 'Disposable demo', email: `demo-${randomUUID()}@example.com`, password: await require('bcryptjs').hash(password, 4), role: 'staff', privateWorkspace: false } });
  demo = (await request(app).post('/api/auth/login').send({ email: user.email, password })).body;
  const ownerEmail = `owner-${randomUUID()}@example.com`;
  process.env.SUPER_ADMIN_EMAIL = ownerEmail;
  await getPrisma().user.create({ data: { name: 'Disposable app owner', email: ownerEmail, password: await require('bcryptjs').hash(password, 4), role: 'admin', privateWorkspace: false } });
  owner = (await request(app).post('/api/auth/login').send({ email: ownerEmail, password })).body;
});
afterAll(async () => {
  // The guarded, disposable test database is discarded by CI.
  if (originalDemo === undefined) delete process.env.DEMO_READ_ONLY; else process.env.DEMO_READ_ONLY = originalDemo;
  if (originalOwner === undefined) delete process.env.SUPER_ADMIN_EMAIL; else process.env.SUPER_ADMIN_EMAIL = originalOwner;
  await disconnectDB();
});

test('new accounts start empty with no demo flag or other users settings', async () => {
  for (const account of [a, b]) {
    expect((await send('get', '/health', account)).body).toMatchObject({ privateWorkspace: true, demoReadOnly: false });
    expect((await send('get', '/products', account)).body.products).toEqual([]);
    expect((await send('get', '/customers', account)).body).toEqual([]);
    expect((await send('get', '/sales', account)).body.sales).toEqual([]);
    expect((await send('get', '/dashboard/stats', account)).body).toMatchObject({ totalProducts: 0, totalSales: 0, totalRevenue: 0, totalProfit: 0 });
    const settings = await send('get', '/settings', account);
    expect(settings.status).toBe(200);
    expect(settings.body.profile.email).toBe(account.user.email);
    expect(settings.body.business.businessAddress).toBe('');
  }
});

test('each account can save inventory with the same SKU independently', async () => {
  expect((await send('post', '/products/categories', a, { name: 'My category' })).status).toBe(201);
  expect((await send('post', '/products/categories', b, { name: 'My category' })).status).toBe(201);
  expect((await send('post', '/products/categories', a, { name: 'MY CATEGORY' })).status).toBe(409);
  expect((await send('post', '/products/categories', a, { name: 'Only A' })).status).toBe(201);
  expect((await send('get', '/products/categories', b)).body.some(c => c.category === 'Only A')).toBe(false);
  const sku = `PRIVATE-${randomUUID()}`;
  for (const account of [a, b]) {
    const result = await send('post', '/products', account, { name: account === a ? 'Private A' : 'Private B', category: 'Test', sku, price: 50, cost: 30, stock: 10, workspaceOwnerId: demo.user.id });
    expect(result.status).toBe(201);
    expect(result.body.workspaceOwnerId).toBe(account.user.id);
    if (account === a) productA = result.body; else productB = result.body;
  }
  expect((await send('get', '/products', a)).body.products.map(p => p.id)).toEqual([productA.id]);
  expect((await send('get', '/products', b)).body.products.map(p => p.id)).toEqual([productB.id]);
});

test('foreign IDs cannot be read, edited, restocked, deleted or sold', async () => {
  for (const [method, path, body] of [
    ['get', `/products/${productA.id}`],
    ['put', `/products/${productA.id}`, { name: 'Hijacked' }],
    ['patch', `/products/${productA.id}/stock`, { delta: 5 }],
    ['delete', `/products/${productA.id}`],
    ['post', '/sales', { items: [{ productId: productA.id, quantity: 1 }] }],
  ]) expect((await send(method, path, b, body)).status).toBe(404);
  expect((await send('get', `/products/${productA.id}`, a)).body.stock).toBe(10);
});

test('checkout rejects foreign customers and rolls back stock before saving an owned invoice', async () => {
  customerA = (await send('post', '/customers', a, { name: 'Private customer', phone: '01700000001' })).body;
  expect((await send('post', '/sales', b, { customerId: customerA.id, items: [{ productId: productB.id, quantity: 1 }] })).status).toBe(404);
  expect((await send('get', `/products/${productB.id}`, b)).body.stock).toBe(10);
  const result = await send('post', '/sales', a, { customerId: customerA.id, items: [{ productId: productA.id, quantity: 2 }] });
  expect(result.status).toBe(201);
  saleA = result.body;
  expect(saleA.total).toBe(100);
  expect((await send('get', `/sales/${saleA.id}`, b)).status).toBe(404);
  expect((await send('get', `/customers/${customerA.id}`, b)).status).toBe(404);
});

test('reports, stock history, assistant tools and settings remain account scoped', async () => {
  expect((await send('get', '/dashboard/stats?dateFilter=All%20Time', b)).body.totalRevenue).toBe(0);
  const logs = (await send('get', '/products/stock-history', b)).body;
  expect(logs.every(log => log.productId === productB.id)).toBe(true);
  const insights = await send('get', '/ai/insights', b);
  expect(insights.status).toBe(200);
  expect(JSON.stringify(insights.body)).not.toContain('Private A');
  const tool = await workspaceContext.run(b.user, () => executeApprovedChatTool('get_invoice_details', { invoiceNumber: saleA.invoiceNumber }, b.user));
  expect(JSON.stringify(tool)).not.toContain(customerA.name);
  expect((await send('put', '/settings', a, { businessName: 'My private shop', taxRate: 5 })).status).toBe(200);
  expect((await send('get', '/settings', b)).body.business.name).not.toBe('My private shop');
  expect((await send('get', '/users', a)).body.users).toEqual([]);
});

test('fresh login preserves products, stock, sales and settings; demo remains read-only and isolated', async () => {
  const relogin = (await request(app).post('/api/auth/login').send({ email: a.user.email, password })).body;
  expect((await send('get', `/products/${productA.id}`, relogin)).body.stock).toBe(8);
  expect((await send('get', `/sales/${saleA.id}`, relogin)).body.total).toBe(100);
  expect((await send('get', '/settings', relogin)).body.business.name).toBe('My private shop');
  expect((await send('get', '/health', demo)).body.demoReadOnly).toBe(true);
  expect((await send('post', '/products', demo, { name: 'Forbidden' })).status).toBe(403);
  expect((await send('get', `/products/${productA.id}`, demo)).status).toBe(404);
});

test('admin-created staff share their admin data, can checkout but cannot edit inventory, passwords or fields', async () => {
  const email = `staff-${randomUUID()}@example.com`;
  const created = await send('post', '/users', a, { name: 'Workspace staff', email, password, role: 'staff', adminId: b.user.id });
  expect(created.status).toBe(201);
  expect(created.body.adminId).toBe(a.user.id);
  staff = (await request(app).post('/api/auth/login').send({ email, password })).body;
  expect((await send('get', `/products/${productA.id}`, staff)).status).toBe(200);
  expect((await send('get', `/products/${productB.id}`, staff)).status).toBe(404);
  expect((await send('get', '/settings', staff)).body.business.name).toBe('My private shop');
  expect((await send('put', '/settings/password', staff, { currentPassword: password, newPassword: 'ForbiddenNewPassword123' })).status).toBe(403);
  expect((await send('put', '/settings', staff, { preferences: { productFields: [] } })).status).toBe(403);
  expect((await send('put', `/products/${productA.id}`, staff, { name: 'Forbidden' })).status).toBe(403);
  expect((await send('get', '/users', staff)).status).toBe(403);
  expect((await send('post', '/products/categories', staff, { name: 'Forbidden' })).status).toBe(403);
  expect((await send('post', '/users', a, { name: 'Forged admin', email: `forged-${randomUUID()}@example.com`, password, role: 'admin' })).status).toBe(403);
  expect((await send('patch', `/users/${staff.user.id}/status`, b, { isActive: false })).status).toBe(404);
  expect((await send('post', '/sales', staff, { items: [{ productId: productA.id, quantity: 1 }] })).status).toBe(201);
});

test('owner restriction blocks admin and staff; restoring requires new sessions', async () => {
  const oldAdmin = a, oldStaff = staff;
  expect((await send('patch', `/users/${a.user.id}/status`, owner, { isActive: false })).status).toBe(200);
  for (const account of [a, staff]) {
    expect((await send('get', '/auth/me', account)).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: account.user.email, password })).status).toBe(401);
  }
  expect((await send('patch', `/users/${a.user.id}/status`, owner, { isActive: true })).status).toBe(200);
  expect((await send('get', '/auth/me', oldAdmin)).status).toBe(401);
  expect((await send('get', '/auth/me', oldStaff)).status).toBe(401);
  a = (await request(app).post('/api/auth/login').send({ email: a.user.email, password })).body;
  staff = (await request(app).post('/api/auth/login').send({ email: staff.user.email, password })).body;
  expect((await send('get', '/auth/me', staff)).status).toBe(200);
});

test('owner deletion cascades staff accounts and owned records without touching another workspace', async () => {
  expect((await send('delete', `/users/${a.user.id}`, owner)).status).toBe(200);
  expect(await getPrisma().user.findUnique({ where: { id: a.user.id } })).toBeNull();
  expect(await getPrisma().user.findUnique({ where: { id: staff.user.id } })).toBeNull();
  expect(await getPrisma().product.count({ where: { workspaceOwnerId: a.user.id } })).toBe(0);
  expect(await getPrisma().category.count({ where: { workspaceOwnerId: a.user.id } })).toBe(0);
  expect((await send('get', '/auth/me', staff)).status).toBe(401);
  expect((await send('get', `/products/${productB.id}`, b)).status).toBe(200);
});

