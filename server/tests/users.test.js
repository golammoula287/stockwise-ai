const express = require('express');
const request = require('supertest');
let mockUser;
const mockPrisma = { user: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn() }, saleItem: { deleteMany: jest.fn() }, stockLog: { deleteMany: jest.fn() }, sale: { deleteMany: jest.fn() }, product: { deleteMany: jest.fn() }, customer: { deleteMany: jest.fn() } };
mockPrisma.category = { deleteMany: jest.fn() };
mockPrisma.$transaction = jest.fn(async fn => fn(mockPrisma));
jest.mock('../middleware/auth', () => ({ protect: (req, res, next) => { req.user = mockUser; next(); } }));
jest.mock('../config/db', () => ({ getPrisma: () => mockPrisma, isValidId: id => ['target-id', 'owner-id', 'admin-id'].includes(id) }));
const owner = { id: 'owner-id', email: 'owner@example.com', role: 'admin', privateWorkspace: false };
const admin = { id: 'admin-id', email: 'admin@example.com', role: 'admin', privateWorkspace: true };
const targetAdmin = { id: 'target-id', name: 'Business admin', email: 'target@example.com', role: 'admin', privateWorkspace: true, adminId: null };
const targetStaff = { ...targetAdmin, role: 'staff', adminId: admin.id };
const app = express(); app.use(express.json()); app.use('/users', require('../routes/users')); app.use((err, req, res, next) => res.status(500).json({ message: 'Test error' }));
beforeEach(() => {
  process.env.SUPER_ADMIN_EMAIL = owner.email;
  mockUser = owner;
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(targetAdmin);
  mockPrisma.user.update.mockResolvedValue(targetAdmin);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.user.count.mockResolvedValue(0);
});
test('anonymous, staff and legacy non-owner admins cannot manage accounts', async () => {
  for (const user of [undefined, { ...targetStaff, id: 'staff-id' }, { ...admin, privateWorkspace: false }]) {
    mockUser = user;
    for (const method of ['get', 'post', 'delete']) {
      expect([401, 403]).toContain((await request(app)[method](method === 'delete' ? '/users/target-id' : '/users').send({})).status);
    }
  }
  expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
});
test('owner lists admins; workspace admin lists only their own staff, with safe fields and pagination', async () => {
  expect((await request(app).get('/users?search=target&page=2')).status).toBe(200);
  expect(mockPrisma.user.findMany.mock.calls[0][0]).toMatchObject({ where: { role: 'admin', adminId: null, privateWorkspace: true }, skip: 50, take: 50 });
  expect(mockPrisma.user.findMany.mock.calls[0][0].select.password).toBeUndefined();
  mockUser = admin;
  expect((await request(app).get('/users')).status).toBe(200);
  expect(mockPrisma.user.findMany.mock.calls[1][0].where).toEqual({ role: 'staff', adminId: admin.id });
});
test('management overview counts business admins and their staff, excludes legacy owner identities, and denies shop admins', async () => {
  mockPrisma.user.count.mockResolvedValueOnce(4).mockResolvedValueOnce(3).mockResolvedValueOnce(1).mockResolvedValueOnce(7);
  const result = await request(app).get('/users/overview');
  expect(result.status).toBe(200);
  expect(result.body).toEqual({ totalAdmins: 4, activeAdmins: 3, restrictedAdmins: 1, totalStaff: 7 });
  const businessAdmins = { role: 'admin', adminId: null, privateWorkspace: true };
  expect(mockPrisma.user.count.mock.calls[0][0].where).toEqual(businessAdmins);
  expect(mockPrisma.user.count.mock.calls[3][0].where).toEqual({ role: 'staff', admin: businessAdmins });
  mockUser = admin;
  expect((await request(app).get('/users/overview')).status).toBe(403);
});
test('legacy workspace-owner names are not managed as platform or business-owner accounts', async () => {
  mockPrisma.user.findUnique.mockResolvedValue({ ...targetAdmin, name: 'Workspace Owner', privateWorkspace: false });
  expect((await request(app).patch('/users/target-id').send({ name: 'Changed' })).status).toBe(404);
});
test('owner creates only admins; admin creates only staff bound to their workspace', async () => {
  const body = { name: 'New user', email: 'NEW@example.com', password: 'SomePrivatePassword123' };
  mockPrisma.user.create.mockResolvedValue({ id: 'target-id', email: 'new@example.com' });
  expect((await request(app).post('/users').send({ ...body, role: 'staff' })).status).toBe(403);
  expect((await request(app).post('/users').send({ ...body, role: 'admin', isSuperAdmin: true })).status).toBe(201);
  let saved = mockPrisma.user.create.mock.calls[0][0].data;
  expect(saved).toMatchObject({ role: 'admin', privateWorkspace: true, adminId: null });
  expect(saved.password).toMatch(/^\$2/); expect(saved.isSuperAdmin).toBeUndefined();
  mockUser = admin;
  expect((await request(app).post('/users').send({ ...body, role: 'admin' })).status).toBe(403);
  expect((await request(app).post('/users').send({ ...body, role: 'staff', adminId: 'foreign-admin', privateWorkspace: false })).status).toBe(201);
  saved = mockPrisma.user.create.mock.calls[1][0].data;
  expect(saved).toMatchObject({ role: 'staff', privateWorkspace: true, adminId: admin.id });
});
test('admin cannot edit, restrict, delete or reset another admins staff or an admin', async () => {
  mockUser = admin;
  for (const target of [targetAdmin, { ...targetStaff, adminId: 'foreign-admin' }]) {
    mockPrisma.user.findUnique.mockResolvedValue(target);
    for (const [method, suffix, body] of [['patch', '', { name: 'Changed' }], ['patch', '/status', { isActive: false }], ['patch', '/password', { password: 'NewPrivatePassword123' }], ['delete', '', {}]]) {
      expect((await request(app)[method](`/users/target-id${suffix}`).send(body)).status).toBe(404);
    }
  }
  expect(mockPrisma.user.update).not.toHaveBeenCalled(); expect(mockPrisma.user.delete).not.toHaveBeenCalled();
});
test('owner identity is protected, role escalation is rejected and edits whitelist fields', async () => {
  mockPrisma.user.findUnique.mockResolvedValue(owner);
  expect((await request(app).delete('/users/owner-id')).status).toBe(403);
  mockPrisma.user.findUnique.mockResolvedValue(targetStaff); mockUser = admin;
  expect((await request(app).patch('/users/target-id').send({ name: 'Changed', role: 'admin' })).status).toBe(400);
  expect((await request(app).patch('/users/target-id').send({ name: 'Changed', email: owner.email, password: 'ignored', adminId: 'foreign-admin' })).status).toBe(200);
  expect(mockPrisma.user.update.mock.calls[0][0]).toMatchObject({ where: { id: 'target-id', role: 'staff', adminId: admin.id }, data: { name: 'Changed' } });
});
test('owner restriction revokes admin and all staff sessions; staff restrictions are independent', async () => {
  expect((await request(app).patch('/users/target-id/status').send({ isActive: false })).status).toBe(200);
  expect(mockPrisma.user.update.mock.calls[0][0].data).toEqual({ isActive: false, tokenVersion: { increment: 1 } });
  expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({ where: { adminId: 'target-id' }, data: { tokenVersion: { increment: 1 } } });
  mockPrisma.user.updateMany.mockClear(); mockUser = admin; mockPrisma.user.findUnique.mockResolvedValue(targetStaff);
  expect((await request(app).patch('/users/target-id/status').send({ isActive: true })).status).toBe(200);
  expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  expect((await request(app).patch('/users/target-id/status').send({ isActive: 'false' })).status).toBe(400);
});
test('admin can reset their staff password and end prior sessions', async () => {
  mockUser = admin; mockPrisma.user.findUnique.mockResolvedValue(targetStaff);
  expect((await request(app).patch('/users/target-id/password').send({ password: 'ReplacementPassword123' })).status).toBe(200);
  const { data } = mockPrisma.user.update.mock.calls[0][0];
  expect(await require('bcryptjs').compare('ReplacementPassword123', data.password)).toBe(true);
  expect(data.tokenVersion).toEqual({ increment: 1 });
});
test('owner deletion atomically removes only the selected private workspace then cascades staff', async () => {
  expect((await request(app).delete('/users/target-id')).status).toBe(200);
  expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  expect(mockPrisma.saleItem.deleteMany).toHaveBeenCalledWith({ where: { sale: { workspaceOwnerId: 'target-id' } } });
  for (const model of ['stockLog', 'sale', 'product', 'customer', 'category']) expect(mockPrisma[model].deleteMany).toHaveBeenCalledWith({ where: { workspaceOwnerId: 'target-id' } });
  expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'target-id', role: 'admin', adminId: null } });
});
test('deleting staff preserves workspace inventory and sales', async () => {
  mockUser = admin; mockPrisma.user.findUnique.mockResolvedValue(targetStaff);
  expect((await request(app).delete('/users/target-id')).status).toBe(200);
  expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'target-id', role: 'staff', adminId: admin.id } });
  expect(mockPrisma.sale.deleteMany).not.toHaveBeenCalled();
});
