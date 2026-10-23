const request = require('supertest');
jest.mock('../config/db', () => {
  const prisma = { $queryRaw: jest.fn() };
  const connect = jest.fn().mockResolvedValue(prisma);
  connect.getPrisma = () => prisma;
  return connect;
});
const app = require('../server');
const connectDB = require('../config/db');
const { validateTestDatabase } = require('../utils/testDatabase');
const originalEnv = { ...process.env };

afterEach(() => { process.env = { ...originalEnv }; });

test('CORS allows the exact frontend and withholds permission for another origin', async () => {
  process.env.CLIENT_URL = 'https://portfolio.example.com';
  const good = await request(app).get('/api/health').set('Origin', process.env.CLIENT_URL);
  expect(good.headers['access-control-allow-origin']).toBe(process.env.CLIENT_URL);
  const bad = await request(app).get('/api/health').set('Origin', 'https://portfolio.example.com.attacker.test');
  expect(bad.headers['access-control-allow-origin']).toBeUndefined();
});

test('production without CLIENT_URL does not allow arbitrary browser origins', async () => {
  process.env.NODE_ENV = 'production';
  delete process.env.CLIENT_URL;
  const res = await request(app).options('/api/products').set('Origin', 'http://localhost:5173');
  expect(res.headers['access-control-allow-origin']).toBeUndefined();
});

test.each(['/products', '/customers', '/sales', '/settings/profile', '/auth/register'])('read-only demo blocks POST %s', async path => {
  process.env.DEMO_READ_ONLY = 'true';
  const res = await request(app).post(`/api${path}`).send({});
  expect(res.status).toBe(403);
  expect(res.body.message).toMatch(/read-only/);
});

test.each(['put', 'patch', 'delete'])('read-only demo blocks %s mutations', async method => {
  process.env.DEMO_READ_ONLY = 'true';
  expect((await request(app)[method]('/api/products/example')).status).toBe(403);
});

test('read-only demo still permits login validation and requires authentication for chat', async () => {
  process.env.DEMO_READ_ONLY = 'true';
  expect((await request(app).post('/api/auth/login').send({})).status).toBe(400);
  expect((await request(app).post('/api/chat').send({ message: 'Hello' })).status).toBe(401);
});

test('readiness executes a database query and returns a sanitized 503 on failure', async () => {
  const prisma = await connectDB();
  prisma.$queryRaw.mockResolvedValueOnce([{ result: 1 }]);
  expect((await request(app).get('/api/ready')).status).toBe(200);
  prisma.$queryRaw.mockRejectedValueOnce(new Error('sensitive database details'));
  const failed = await request(app).get('/api/ready');
  expect(failed.status).toBe(503);
  expect(JSON.stringify(failed.body)).not.toContain('sensitive');
  expect((await request(app).get('/api/health')).status).toBe(200);
});

test('test database is mandatory and cannot alias the development target', () => {
  expect(() => validateTestDatabase('')).toThrow(/required/);
  expect(() => validateTestDatabase('https://example.com/db')).toThrow(/PostgreSQL/);
  expect(() => validateTestDatabase('postgres://other:new@host:5432/db?sslmode=require', 'postgresql://user:pass@host/db')).toThrow(/must differ/);
  expect(() => validateTestDatabase('postgres://user:pass@ep-one-pooler.region.neon.tech/neondb', 'postgres://user:pass@ep-one.region.neon.tech/neondb')).toThrow(/must differ/);
  expect(validateTestDatabase('postgres://user:pass@ep-test.neon.tech/neondb', 'postgres://user:pass@ep-dev.neon.tech/neondb')).toContain('ep-test');
});
