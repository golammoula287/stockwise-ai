const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getPrisma } = require('../config/db');
const { protect, adminOnly } = require('../middleware/auth');
const { signToken } = require('./auth');

const router = express.Router();

router.use(protect);

const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;

const DEFAULT_PREFERENCES = {
  lowStockAlerts: true,
  emailReports: false,
  autoReorderSuggestions: true,
  dateFormat: 'MMM DD, YYYY',
};

async function getOrCreateSetting(prisma, userId) {
  let setting = await prisma.setting.findUnique({ where: { userId } });
  if (!setting) {
    setting = await prisma.setting.create({
      data: {
        userId,
        businessName: 'StockWise AI',
        businessEmail: '',
        businessPhone: '',
        businessAddress: '',
        preferences: DEFAULT_PREFERENCES,
      },
    });
  }
  return setting;
}

router.get('/', async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const [user, setting] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id } }),
      getOrCreateSetting(prisma, req.user.id),
    ]);

    res.json({
      profile: {
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        avatar: user.avatar || null,
      },
      business: {
        name: setting.businessName || user.businessName || 'StockWise AI',
        currency: setting.currency || '৳',
        taxRate: setting.taxRate ?? 0,
        lowStockThresholdDefault: setting.lowStockThresholdDefault ?? 5,
        businessEmail: setting.businessEmail || user.email,
        businessPhone: setting.businessPhone || user.phone || '',
        businessAddress: setting.businessAddress || '',
      },
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...(setting.preferences || {}),
      },
      capabilities: {
        smtpConfigured: Boolean(process.env.SMTP_HOST),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/',
  adminOnly,
  [
    body('name').optional().notEmpty().trim().withMessage('Name cannot be empty').isLength({ max: 120 }),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email address is required'),
    body('phone')
      .optional({ checkFalsy: true })
      .matches(PHONE_REGEX)
      .withMessage('Valid phone number is required (7-20 digits)'),
    body('taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
    body('lowStockThresholdDefault')
      .optional()
      .isInt({ min: 0, max: 100000 })
      .withMessage('Default low-stock threshold must be a non-negative integer'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
      }

      const {
        name,
        email,
        phone,
        avatar,
        businessName,
        currency,
        taxRate,
        lowStockThresholdDefault,
        businessEmail,
        businessPhone,
        businessAddress,
        preferences,
      } = req.body;

      const prisma = getPrisma();

      if (email !== undefined && String(email).trim()) {
        const normalizedEmail = String(email).trim().toLowerCase();
        const duplicateUser = await prisma.user.findFirst({
          where: {
            email: normalizedEmail,
            NOT: { id: req.user.id },
          },
        });
        if (duplicateUser) {
          return res.status(400).json({ message: 'Email address is already in use by another account' });
        }
      }

      const userUpdate = {};
      if (name !== undefined && String(name).trim()) userUpdate.name = String(name).trim();
      if (email !== undefined && String(email).trim()) userUpdate.email = String(email).trim().toLowerCase();
      if (phone !== undefined) userUpdate.phone = String(phone).trim();
      if (avatar !== undefined) userUpdate.avatar = avatar;
      if (businessName !== undefined && String(businessName).trim()) {
        userUpdate.businessName = String(businessName).trim();
      }

      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: userUpdate,
      });

      const existingSetting = await getOrCreateSetting(prisma, req.user.id);
      const settingData = {};
      if (businessName !== undefined && String(businessName).trim()) {
        settingData.businessName = String(businessName).trim();
      }
      if (currency !== undefined && String(currency).trim()) {
        settingData.currency = String(currency).trim().slice(0, 6);
      }
      if (taxRate !== undefined) {
        settingData.taxRate = Math.round(Number(taxRate) * 100) / 100;
      }
      if (lowStockThresholdDefault !== undefined) {
        settingData.lowStockThresholdDefault = Math.max(0, parseInt(lowStockThresholdDefault, 10) || 0);
      }
      if (businessEmail !== undefined) settingData.businessEmail = String(businessEmail).trim();
      if (businessPhone !== undefined) settingData.businessPhone = String(businessPhone).trim();
      if (businessAddress !== undefined) settingData.businessAddress = String(businessAddress).trim();
      if (preferences && typeof preferences === 'object') {
        settingData.preferences = {
          ...DEFAULT_PREFERENCES,
          ...(existingSetting.preferences || {}),
          ...preferences,
        };
      }

      const setting = await prisma.setting.update({
        where: { id: existingSetting.id },
        data: settingData,
      });

      res.json({
        message: 'Settings updated successfully',
        user: {
          id: user.id,
          _id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          privateWorkspace: user.privateWorkspace === true,
          isSuperAdmin: require('../utils/superAdmin').isSuperAdmin(user),
          businessName: setting.businessName,
        },
        business: {
          name: setting.businessName,
          currency: setting.currency,
          taxRate: setting.taxRate,
          lowStockThresholdDefault: setting.lowStockThresholdDefault,
          businessEmail: setting.businessEmail,
          businessPhone: setting.businessPhone,
          businessAddress: setting.businessAddress,
        },
        preferences: setting.preferences,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/password',
  adminOnly,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
      }
      const { currentPassword, newPassword } = req.body;
      if (currentPassword === newPassword) {
        return res.status(400).json({ message: 'New password must be different from current password' });
      }
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      const ok = await bcrypt.compare(String(currentPassword), user.password);
      if (!ok) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
      const hashedPassword = await bcrypt.hash(String(newPassword), rounds);
      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: { password: hashedPassword, tokenVersion: { increment: 1 } },
      });
      const token = signToken(updatedUser);
      res.json({
        message: 'Password updated successfully',
        token,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
