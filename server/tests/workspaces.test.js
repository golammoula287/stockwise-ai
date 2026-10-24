const request = require('supertest');
const jwt = require('jsonwebtoken');
const { workspaceContext, workspaceQuery, scopeArgs } = require('../utils/workspaceScope');
const alice = { id: '11111111-1111-4111-8111-111111111111', name: 'Alice', email: 'alice@example.com', role: 'admin', privateWorkspace: true };
const bob = { ...alice, id: '22222222-2222-4222-8222-222222222222', email: 'bob@example.com' };
const legacy = { ...alice, id: '33333333-3333-4333-8333-333333333333', privateWorkspace: false };
const staff = { ...alice, id: '44444444-4444-4444-8444-444444444444', email: 'staff@example.com', role: 'staff', adminId: alice.id };
const owner = { ...legacy, id: '55555555-5555-4555-8555-555555555555', email: 'platform-owner@example.com' };

jest.mock('../config/db', () => {
  const prisma = { user: { findUnique: jest.fn() }, product: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() }, saleItem: { count: jest.fn() }, $queryRaw: jest.fn() };
  prisma.$transaction = async fn => fn(prisma);
  const connect = jest.fn().mockResolvedValue(prisma);
  connect.getPrisma = () => prisma;
  connect.isValidId = value => /^[a-f0-9-]{36}$/i.test(value);
  connect.computeProductStatus = () => 'In Stock';
  return connect;
});
const prisma = require('../config/db').getPrisma();
const app = require('../server');
const original = { ...process.env };
const auth = user => `Bearer ${jwt.sign({ id: user.id, privateWorkspace: !user.privateWorkspace }, require('../middleware/auth').getJwtSecret())}`;
beforeEach(() => {
  process.env.DEMO_READ_ONLY = 'true';
  jest.clearAllMocks();
  alice.isActive = true; staff.isActive = true; alice.tokenVersion = 0; staff.tokenVersion = 0;
  prisma.user.findUnique.mockImplementation(async ({ where }) => [alice, bob, legacy, staff, owner].find(user => user.id === where.id));
});
afterEach(() => { process.env = { ...original }; });

test('authenticated health distinguishes permanent workspaces from the demo using database identity', async () => {
  for (const user of [alice, legacy]) {
    const res = await request(app).get('/api/health').set('Authorization', auth(user));
    expect(res.status).toBe(200);
    expect(res.body.privateWorkspace).toBe(user.privateWorkspace);
    expect(res.body.demoReadOnly).toBe(!user.privateWorkspace);
    expect(res.headers['cache-control']).toBe('no-store');
  }
});
test('app owner has no shop-data API access and is never treated as a browser demo', async () => {
  process.env.SUPER_ADMIN_EMAIL = owner.email;
  for (const path of ['/products', '/customers', '/sales', '/dashboard/stats', '/ai/insights', '/chat/status', '/settings']) {
    const result = await request(app).get(`/api${path}`).set('Authorization', auth(owner));
    expect(result.status).toBe(403);
    expect(result.body.message).toContain('App Owner');
  }
  expect(prisma.product.findMany).not.toHaveBeenCalled();
  const health = await request(app).get('/api/health').set('Authorization', auth(owner));
  expect(health.body).toMatchObject({ appOwner: true, demoReadOnly: false });
});

test('concurrent authenticated requests keep independent workspace contexts across asynchronous work', async () => {
  prisma.product.findMany.mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, workspaceContext.getStore().id === alice.id ? 15 : 1));
    return [{ id: workspaceContext.getStore().id, stock: 1 }];
  });
  const responses = await Promise.all([alice, bob].map(user => request(app).get('/api/products').set('Authorization', auth(user))));
  expect(responses.map(res => res.body.products[0].id)).toEqual([alice.id, bob.id]);
  expect(workspaceContext.getStore()).toBeUndefined();
});

test('private account writes reach ownership-checked SQL; public demo writes stay blocked', async () => {
  prisma.$queryRaw.mockResolvedValue([]);
  prisma.product.findUnique.mockResolvedValue(null);
  const productId = bob.id;
  const result = await request(app).patch(`/api/products/${productId}/stock`).set('Authorization', auth(alice)).send({ delta: 1 });
  expect(result.status).toBe(404);
  const [parts, ...values] = prisma.$queryRaw.mock.calls[0];
  expect(parts.join('?')).toContain('"workspaceOwnerId" IS NOT DISTINCT FROM');
  expect(values).toContain(alice.id);
  prisma.$queryRaw.mockClear();
  expect((await request(app).patch(`/api/products/${productId}/stock`).set('Authorization', auth(legacy)).send({ delta: 1 })).status).toBe(403);
  expect(prisma.$queryRaw).not.toHaveBeenCalled();
});

test('checkout raw stock deductions enforce the authenticated owner too', async () => {
  prisma.$queryRaw.mockResolvedValue([]);
  prisma.product.findUnique.mockResolvedValue(null);
  const res = await request(app).post('/api/sales').set('Authorization', auth(alice)).send({ items: [{ productId: bob.id, quantity: 1 }] });
  expect(res.status).toBe(404);
  const [parts, ...values] = prisma.$queryRaw.mock.calls[0];
  expect(parts.join('?')).toContain('"workspaceOwnerId" IS NOT DISTINCT FROM');
  expect(values).toContain(alice.id);
});

test.each(['Product', 'Customer', 'Sale', 'StockLog', 'Category'])('%s filters every read, aggregate, ID lookup and mutation to its workspace', model => {
  for (const operation of ['findMany', 'findUnique', 'findFirst', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany']) {
    const args = scopeArgs(model, operation, { where: { id: bob.id, workspaceOwnerId: bob.id, OR: [{ name: 'secret' }] } }, alice);
    expect(args.where.workspaceOwnerId).toBe(alice.id);
    expect(args.where.id).toBe(bob.id);
    expect(scopeArgs(model, operation, {}, legacy).where.workspaceOwnerId).toBeNull();
  }
  expect(scopeArgs(model, 'create', { data: { workspaceOwnerId: bob.id, name: 'Mine' } }, alice).data.workspaceOwnerId).toBe(alice.id);
  expect(scopeArgs(model, 'update', { where: { id: alice.id }, data: { workspaceOwnerId: bob.id } }, alice).data.workspaceOwnerId).toBe(alice.id);
});

test('invoice lines and settings cannot read another account through fallback queries', () => {
  expect(scopeArgs('SaleItem', 'count', { where: { productId: bob.id } }, alice).where).toEqual({ productId: bob.id, sale: { workspaceOwnerId: alice.id } });
  expect(scopeArgs('Setting', 'findFirst', {}, alice).where).toEqual({ userId: alice.id });
  expect(scopeArgs('Setting', 'create', { data: { userId: bob.id } }, alice).data.userId).toBe(alice.id);
});

test('query extension uses request scope and leaves administrative scripts outside request scope', async () => {
  const query = jest.fn().mockResolvedValue([]);
  await workspaceContext.run(alice, () => workspaceQuery({ model: 'Product', operation: 'findMany', args: {}, query }));
  expect(query).toHaveBeenLastCalledWith({ where: { workspaceOwnerId: alice.id } });
  await workspaceQuery({ model: 'Product', operation: 'findMany', args: {}, query });
  expect(query).toHaveBeenLastCalledWith({});
  expect(() => scopeArgs('Product', 'upsert', {}, alice)).toThrow(/Unsupported/);
});

test('private workspace administrators never receive platform owner privileges', () => {
  process.env.SUPER_ADMIN_EMAIL = alice.email;
  expect(require('../utils/superAdmin').isSuperAdmin(alice)).toBe(false);
});

test('staff share only their admin workspace, including business settings and transactional stock ownership', async () => {
  for (const model of ['Product', 'Customer', 'Sale', 'StockLog']) {
    expect(scopeArgs(model, 'findMany', {}, staff).where.workspaceOwnerId).toBe(alice.id);
    expect(scopeArgs(model, 'create', { data: {} }, staff).data.workspaceOwnerId).toBe(alice.id);
  }
  expect(scopeArgs('Setting', 'findFirst', {}, staff).where.userId).toBe(alice.id);
  prisma.$queryRaw.mockResolvedValue([]); prisma.product.findUnique.mockResolvedValue(null);
  expect((await request(app).post('/api/sales').set('Authorization', auth(staff)).send({ items: [{ productId: bob.id, quantity: 1 }] })).status).toBe(404);
  expect(prisma.$queryRaw.mock.calls[0].slice(1)).toContain(alice.id);
  expect(prisma.$queryRaw.mock.calls[0].slice(1)).not.toContain(staff.id);
});

test('staff cannot change any passwords, inventory fields, business settings or user accounts', async () => {
  for (const [method, path, body] of [
    ['put', '/settings/password', { currentPassword: 'old', newPassword: 'NewPassword123456' }],
    ['put', '/settings', { preferences: { productFields: [{ label: 'Forged' }] } }],
    ['post', '/products', { name: 'Forged', category: 'Test', price: 1, stock: 1 }],
    ['put', `/products/${bob.id}`, { name: 'Forged' }],
    ['patch', `/products/${bob.id}/stock`, { delta: 1 }],
    ['delete', `/products/${bob.id}`, {}],
    ['get', '/users', {}],
  ]) {
    expect((await request(app)[method](`/api${path}`).set('Authorization', auth(staff)).send(body)).status).toBe(403);
  }
  expect(prisma.product.update).not.toHaveBeenCalled();
});

test('restricting or deleting the parent admin blocks existing staff tokens on every request', async () => {
  alice.isActive = false;
  expect((await request(app).get('/api/auth/me').set('Authorization', auth(alice))).status).toBe(401);
  expect((await request(app).get('/api/auth/me').set('Authorization', auth(staff))).status).toBe(401);
  alice.isActive = true;
  prisma.user.findUnique.mockImplementation(async ({ where }) => where.id === staff.id ? staff : null);
  expect((await request(app).get('/api/auth/me').set('Authorization', auth(staff))).status).toBe(401);
});

test('restoration and password resets cannot revive prior tokens', async () => {
  alice.tokenVersion = 2; staff.tokenVersion = 2;
  for (const user of [alice, staff]) {
    expect((await request(app).get('/api/auth/me').set('Authorization', auth(user))).status).toBe(401);
    const token = require('../routes/auth').signToken(user);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);
  }
});

test('staff linked to a disabled, non-admin or non-workspace parent cannot authenticate', async () => {
  const { assertAccountAccess } = require('../utils/accountAccess');
  for (const parent of [null, { ...alice, isActive: false }, { ...alice, role: 'staff' }, { ...alice, privateWorkspace: false }, { ...alice, adminId: bob.id }]) {
    await expect(assertAccountAccess({ user: { findUnique: async () => parent } }, staff)).rejects.toMatchObject({ status: 401 });
  }
});
