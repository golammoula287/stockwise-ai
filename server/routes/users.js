const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getPrisma, isValidId } = require('../config/db');
const { protect } = require('../middleware/auth');
const { isSuperAdmin } = require('../utils/superAdmin');
const { workspaceContext } = require('../utils/workspaceScope');
const { createRateLimiter } = require('../middleware/rateLimit');
const router = express.Router();
const select = { id: true, name: true, email: true, role: true, createdAt: true, privateWorkspace: true, adminId: true, isActive: true, _count: { select: { staff: true } } };
const canManage = user => isSuperAdmin(user) || (user?.role === 'admin' && user.privateWorkspace === true && !user.adminId);
const scope = user => isSuperAdmin(user) ? { role: 'admin', adminId: null, privateWorkspace: true } : { role: 'staff', adminId: user.id };
const passwordRule = field => body(field).isString().isLength({ min: 12, max: 72 }).custom(value => Buffer.byteLength(value, 'utf8') <= 72);
const managerScope = req => req.accountManagerScope;

router.use(protect, (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Sign in to continue.' });
  if (!canManage(req.user)) return res.status(403).json({ message: 'Account administration requires an admin account.' });
  req.accountManagerScope = scope(req.user);
  next();
}, createRateLimiter({ prefix: 'user-management', windowMs: 60000, max: 60 }));

router.get('/overview', async (req, res, next) => {
  if (!isSuperAdmin(req.user)) return res.status(403).json({ message: 'App owner access required.' });
  try {
    const admins = scope(req.user);
    const [totalAdmins, activeAdmins, restrictedAdmins, totalStaff] = await Promise.all([
      getPrisma().user.count({ where: admins }),
      getPrisma().user.count({ where: { ...admins, isActive: true } }),
      getPrisma().user.count({ where: { ...admins, isActive: false } }),
      getPrisma().user.count({ where: { role: 'staff', admin: admins } }),
    ]);
    res.set('Cache-Control', 'no-store').json({ totalAdmins, activeAdmins, restrictedAdmins, totalStaff });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const where = { ...managerScope(req) };
    if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }];
    const page = Math.max(1, parseInt(req.query.page, 10) || 1), limit = 50;
    const [users, total] = await Promise.all([
      getPrisma().user.findMany({ where, select, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: limit, skip: (page - 1) * limit }),
      getPrisma().user.count({ where }),
    ]);
    res.json({ users: users.map(user => ({ ...user, isSuperAdmin: isSuperAdmin(user) })), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) { next(error); }
});

router.post('/', [body('name').isString().trim().isLength({ min: 2, max: 80 }), body('email').isEmail().isLength({ max: 254 }), passwordRule('password')], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Enter a valid name, email and a 12–72 character password.' });
    const role = isSuperAdmin(req.user) ? 'admin' : 'staff';
    if (req.body.role !== undefined && req.body.role !== role) return res.status(403).json({ message: `You can create only ${role} accounts.` });
    const email = req.body.email.toLowerCase().trim();
    if ([process.env.SUPER_ADMIN_EMAIL, process.env.DEMO_LOGIN_EMAIL || 'visitor@stockwise.example'].some(value => value?.trim().toLowerCase() === email)) return res.status(400).json({ message: 'This account identity is reserved.' });
    const password = await bcrypt.hash(req.body.password, 12);
    const user = await getPrisma().user.create({ data: { name: req.body.name, email, password, role, privateWorkspace: true, adminId: role === 'staff' ? req.user.id : null, isActive: true }, select });
    res.status(201).json(user);
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'This email is already registered.' });
    next(error);
  }
});

router.use('/:id', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID.' });
    const target = await getPrisma().user.findUnique({ where: { id: req.params.id }, select });
    if (!target) return res.status(404).json({ message: 'User not found.' });
    if (target.id === req.user.id || isSuperAdmin(target)) return res.status(403).json({ message: 'The app owner account cannot be changed or deleted here.' });
    const allowed = isSuperAdmin(req.user) ? target.role === 'admin' && !target.adminId && target.privateWorkspace === true : target.role === 'staff' && target.adminId === req.user.id;
    if (!allowed) return res.status(404).json({ message: 'User not found.' });
    req.managedUser = target;
    next();
  } catch (error) { next(error); }
});

router.patch('/:id', [body('name').isString().trim().isLength({ min: 2, max: 80 })], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Enter a valid name.' });
    if (req.body.role !== undefined && req.body.role !== req.managedUser.role) return res.status(400).json({ message: 'Account roles cannot be changed. Create the appropriate account instead.' });
    const user = await getPrisma().user.update({ where: { id: req.params.id, ...managerScope(req) }, data: { name: req.body.name }, select });
    res.json(user);
  } catch (error) { next(error); }
});

router.patch('/:id/status', [body('isActive').isBoolean({ strict: true })], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Choose an active or restricted status.' });
    const user = await getPrisma().$transaction(async tx => {
      const changed = await tx.user.update({ where: { id: req.params.id, ...managerScope(req) }, data: { isActive: req.body.isActive, tokenVersion: { increment: 1 } }, select });
      if (isSuperAdmin(req.user)) await tx.user.updateMany({ where: { adminId: changed.id }, data: { tokenVersion: { increment: 1 } } });
      return changed;
    });
    res.json(user);
  } catch (error) { next(error); }
});

router.patch('/:id/password', [passwordRule('password')], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Use a 12–72 character password.' });
    await getPrisma().user.update({ where: { id: req.params.id, ...managerScope(req) }, data: { password: await bcrypt.hash(req.body.password, 12), tokenVersion: { increment: 1 } } });
    res.json({ message: 'Password reset. Share the new password privately.' });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (isSuperAdmin(req.user)) {
      // Authorization above fixes the target to a non-owner admin. Bypass request
      // business scope only for this explicit, atomic workspace deletion.
      const ownerId = req.managedUser.id;
      await workspaceContext.run(undefined, () => getPrisma().$transaction(async tx => {
        await tx.saleItem.deleteMany({ where: { sale: { workspaceOwnerId: ownerId } } });
        await tx.stockLog.deleteMany({ where: { workspaceOwnerId: ownerId } });
        await tx.sale.deleteMany({ where: { workspaceOwnerId: ownerId } });
        await tx.product.deleteMany({ where: { workspaceOwnerId: ownerId } });
        await tx.customer.deleteMany({ where: { workspaceOwnerId: ownerId } });
        await tx.category.deleteMany({ where: { workspaceOwnerId: ownerId } });
        // The adminId foreign key cascades staff deletion; their settings cascade too.
        await tx.user.delete({ where: { id: ownerId, role: 'admin', adminId: null } });
      }));
      return res.json({ message: 'Admin, their staff accounts and private workspace data deleted.' });
    }
    await getPrisma().user.delete({ where: { id: req.params.id, role: 'staff', adminId: req.user.id } });
    res.json({ message: 'Staff account deleted. Business records are retained.' });
  } catch (error) { next(error); }
});
module.exports = router;
