const request = require('supertest');
jest.mock('../config/db', () => {
  const prisma = { user: { create: jest.fn() } };
  const connect = jest.fn().mockResolvedValue(prisma);
  connect.getPrisma = () => prisma;
  return connect;
});
const app = require('../server');
const prisma = require('../config/db').getPrisma();
const original = { ...process.env };
beforeEach(() => { process.env.DEMO_READ_ONLY = 'true'; jest.clearAllMocks(); });
afterEach(() => { process.env = { ...original }; });
const account = { name: 'Demo Visitor', email: 'visitor-new@example.com', password: 'demo-password-long-123' };
test('public signup creates private workspaces outside read-only demo too', async () => {
  process.env.DEMO_READ_ONLY = 'false';
  prisma.user.create.mockResolvedValue({ id: 'new-id' });
  expect((await request(app).post('/api/auth/signup').send(account)).status).toBe(201);
  expect(prisma.user.create.mock.calls[0][0].data.privateWorkspace).toBe(true);
});
test('signup rejects weak passwords', async () => {
  expect((await request(app).post('/api/auth/signup').send({ ...account, password: 'short' })).status).toBe(400);
  expect(prisma.user.create).not.toHaveBeenCalled();
});
test('signup creates a private workspace admin, hashes password and returns no secrets', async () => {
  prisma.user.create.mockResolvedValue({ id: 'demo-id' });
  const result = await request(app).post('/api/auth/signup').send({ ...account, role: 'admin' });
  expect(result.status).toBe(201);
  const { data } = prisma.user.create.mock.calls[0][0];
  expect(data.role).toBe('admin');
  expect(data.privateWorkspace).toBe(true);
  expect(data.password).not.toBe(account.password);
  expect(await require('bcryptjs').compare(account.password, data.password)).toBe(true);
  expect(result.body.password).toBeUndefined();
  expect(result.body.token).toBeUndefined();
});
test('signup cannot claim the owner email or public demo identity', async () => {
  process.env.SUPER_ADMIN_EMAIL = 'reserved@example.com';
  for (const email of ['reserved@example.com', 'visitor@stockwise.example']) {
    expect((await request(app).post('/api/auth/signup').send({ ...account, email })).status).toBe(409);
  }
  expect(prisma.user.create).not.toHaveBeenCalled();
});
test('duplicate registration is handled without exposing database errors', async () => {
  prisma.user.create.mockRejectedValue({ code: 'P2002' });
  const result = await request(app).post('/api/auth/signup').send(account);
  expect(result.status).toBe(409);
  expect(result.body.message).not.toMatch(/P2002/);
});
