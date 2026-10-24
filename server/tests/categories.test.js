const express = require('express');
const request = require('supertest');
let mockRole = 'admin';
const mockPrisma = { category: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() }, product: { findMany: jest.fn(), findFirst: jest.fn() } };
jest.mock('../config/db', () => ({ getPrisma: () => mockPrisma }));
jest.mock('../middleware/auth', () => ({ protect: (req, res, next) => { req.user = { id: 'admin-a', role: mockRole }; next(); }, adminOnly: (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ message: 'Admin access required' }) }));
const app = express(); app.use(express.json()); app.use('/products', require('../routes/products')); app.use((err, req, res, next) => res.status(500).json({ message: 'Test error' }));
beforeEach(() => { jest.resetAllMocks(); mockRole = 'admin'; mockPrisma.category.findMany.mockResolvedValue([]); mockPrisma.product.findMany.mockResolvedValue([]); mockPrisma.category.findFirst.mockResolvedValue(null); mockPrisma.product.findFirst.mockResolvedValue(null); });

test('admin creates a normalized empty category, which appears before any products exist', async () => {
  mockPrisma.category.create.mockResolvedValue({ name: 'Home Goods' });
  const created = await request(app).post('/products/categories').send({ name: '  Home   Goods  ', workspaceOwnerId: 'foreign' });
  expect(created.status).toBe(201); expect(created.body).toMatchObject({ category: 'Home Goods', count: 0 });
  expect(mockPrisma.category.create).toHaveBeenCalledWith({ data: { name: 'Home Goods', key: 'home goods' } });
  mockPrisma.category.findMany.mockResolvedValue([{ name: 'Home Goods' }]);
  expect((await request(app).get('/products/categories')).body).toEqual([{ category: 'Home Goods', count: 0, totalStock: 0, totalValue: 0, lowStockCount: 0 }]);
});
test('staff cannot create categories even by calling the API directly', async () => {
  mockRole = 'staff';
  expect((await request(app).post('/products/categories').send({ name: 'Forbidden' })).status).toBe(403);
  expect(mockPrisma.category.create).not.toHaveBeenCalled();
});
test.each([undefined, '', '   ', 1, 'x'.repeat(61), 'All', 'all categories'])('invalid or reserved category name is rejected: %s', async name => {
  expect((await request(app).post('/products/categories').send({ name })).status).toBe(400);
  expect(mockPrisma.category.create).not.toHaveBeenCalled();
});
test('saved, used and concurrent duplicate names return a useful conflict', async () => {
  mockPrisma.category.findFirst.mockResolvedValueOnce({ name: 'Clothing' });
  expect((await request(app).post('/products/categories').send({ name: 'clothing' })).status).toBe(409);
  mockPrisma.product.findFirst.mockResolvedValueOnce({ category: 'Clothing' });
  expect((await request(app).post('/products/categories').send({ name: 'CLOTHING' })).status).toBe(409);
  mockPrisma.category.create.mockRejectedValueOnce({ code: 'P2002' });
  expect((await request(app).post('/products/categories').send({ name: 'Clothing' })).status).toBe(409);
});
test('saved categories and existing product categories share statistics safely for arbitrary names', async () => {
  mockPrisma.category.findMany.mockResolvedValue([{ name: '__proto__' }, { name: 'Clothing' }]);
  mockPrisma.product.findMany.mockResolvedValue([{ category: '__proto__', stock: 2, price: 10, lowStockThreshold: 3 }, { category: 'Stationery', stock: 4, price: 5, lowStockThreshold: 1 }]);
  const result = await request(app).get('/products/categories');
  expect(result.status).toBe(200);
  expect(result.body.find(c => c.category === '__proto__')).toMatchObject({ count: 1, totalStock: 2, totalValue: 20, lowStockCount: 1 });
  expect(result.body.find(c => c.category === 'Clothing').count).toBe(0);
  expect(result.body.find(c => c.category === 'Stationery').count).toBe(1);
});
