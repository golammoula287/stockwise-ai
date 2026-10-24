const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const mockVerify = jest.fn();
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockVerify })) }));
const mockUser = { findUnique: jest.fn(), updateMany: jest.fn() };
jest.mock('../config/db', () => ({ getPrisma: () => ({ user: mockUser }), isValidId: () => true }));
const router = require('../routes/googleAuth');
const { demoReadOnly } = require('../middleware/demoReadOnly');
const { resetRateLimiters } = require('../middleware/rateLimit');
const app = express();
app.use(express.json());
app.use('/api', demoReadOnly);
app.use('/api/auth/google', router);
const previous = { ...process.env };
const staff = { id: 'staff-id', name: 'Visitor', email: 'visitor@gmail.com', role: 'staff', googleSubject: null };
beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  process.env.JWT_SECRET = 'private-test-secret-32-characters-only';
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.DEMO_READ_ONLY = 'true';
  resetRateLimiters(); jest.clearAllMocks();
});
afterEach(() => { process.env = { ...previous }; });
async function setup(overrides = {}) {
  const r = await request(app).get('/api/auth/google/challenge');
  const payload = { sub: 'google-subject', email: 'visitor@gmail.com', email_verified: true, nonce: r.body.nonce, ...overrides };
  mockVerify.mockResolvedValue({ getPayload: () => payload });
  return { credential: 'signed-google-credential', challenge: r.body.challenge };
}
test('unconfigured Google authentication fails honestly', async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  expect((await request(app).get('/api/auth/google/config')).body.configured).toBe(false);
  expect((await request(app).post('/api/auth/google').send({})).status).toBe(503);
});
test('rejects missing credentials and untrusted browser origins', async () => {
  expect((await request(app).post('/api/auth/google').send({})).status).toBe(400);
  expect((await request(app).post('/api/auth/google').set('Origin', 'https://attacker.test').send({})).status).toBe(403);
  expect(mockVerify).not.toHaveBeenCalled();
});
test('rejects invalid Google signatures without looking up users', async () => {
  const body = await setup(); mockVerify.mockRejectedValue(new Error('signature invalid'));
  expect((await request(app).post('/api/auth/google').send(body)).status).toBe(401);
  expect(mockUser.findUnique).not.toHaveBeenCalled();
});
test.each([{ nonce: 'wrong-nonce' }, { email_verified: false }])('rejects mismatched nonce or unverified identity: %j', async overrides => {
  expect((await request(app).post('/api/auth/google').send(await setup(overrides))).status).toBe(401);
  expect(mockUser.findUnique).not.toHaveBeenCalled();
});
test('rejects expired login challenges before verifying Google credentials', async () => {
  const body = await setup();
  body.challenge = jwt.sign({ nonce: 'old' }, process.env.JWT_SECRET, { audience: 'stockwise-google-login', expiresIn: -1 });
  expect((await request(app).post('/api/auth/google').send(body)).status).toBe(401);
  expect(mockVerify).not.toHaveBeenCalled();
});
test('does not register unknown Google users', async () => {
  mockUser.findUnique.mockResolvedValue(null);
  expect((await request(app).post('/api/auth/google').send(await setup())).status).toBe(403);
  expect(mockUser.updateMany).not.toHaveBeenCalled();
});
test('does not automatically link third-party mailboxes Google does not control', async () => {
  mockUser.findUnique.mockResolvedValue(null);
  expect((await request(app).post('/api/auth/google').send(await setup({ email: 'visitor@example.com' }))).status).toBe(403);
  expect(mockUser.updateMany).not.toHaveBeenCalled();
});
test('links a verified Gmail identity to an invited account without accepting a role from the browser', async () => {
  mockUser.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(staff);
  mockUser.updateMany.mockResolvedValue({ count: 1 });
  const response = await request(app).post('/api/auth/google').send({ ...await setup(), role: 'admin' });
  expect(response.status).toBe(200);
  expect(response.body.user.role).toBe('staff');
  expect(jwt.verify(response.body.token, process.env.JWT_SECRET).role).toBe('staff');
  expect(mockVerify).toHaveBeenCalledWith({ idToken: 'signed-google-credential', audience: process.env.GOOGLE_CLIENT_ID });
  expect(mockUser.updateMany).toHaveBeenCalledWith({ where: { id: staff.id, googleSubject: null }, data: { googleSubject: 'google-subject' } });
});
test('uses stable Google subject for a linked user even when their Google email changes', async () => {
  mockUser.findUnique.mockResolvedValue({ ...staff, googleSubject: 'google-subject' });
  expect((await request(app).post('/api/auth/google').send(await setup({ email: 'new@gmail.com' }))).status).toBe(200);
  expect(mockUser.updateMany).not.toHaveBeenCalled();
});
test('does not replace an existing different Google identity during linking', async () => {
  mockUser.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...staff, googleSubject: 'other' });
  expect((await request(app).post('/api/auth/google').send(await setup())).status).toBe(403);
  expect(mockUser.updateMany).not.toHaveBeenCalled();
});
