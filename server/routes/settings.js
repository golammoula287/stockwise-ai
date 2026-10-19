const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getPrisma } = require('../config/db');
const { protect } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_PREFERENCES = {
  lowStockAlerts: true,
  emailReports: true,
  autoReorderSuggestions: true,
  dateFormat: 'MMM DD, YYYY',
};

async function getOrCreateSetting(prisma, userId) {
  let setting = await prisma.setting.findUnique({ where: { userId } });
  if (!setting) {
    setting = await prisma.setting.findFirst();
  }
  if (!setting) {
    setting = await prisma.setting.create({
      data: {
        userId,
        preferences: DEFAULT_PREFERENCES,
      },
    });
  }
  return setting;
}

router.get('/', protect, async (req, res, next) => {
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
        phone: user.phone || '01712345678',
        role: user.role,
        avatar: user.avatar || null,
      },
      business: {
        name: setting.businessName || user.businessName || 'StockPro',
        currency: setting.currency || '৳',
        taxRate: setting.taxRate ?? 0,
        lowStockThresholdDefault: setting.lowStockThresholdDefault ?? 5,
        businessEmail: setting.businessEmail || user.email,
        businessPhone: setting.businessPhone || user.phone || '01712345678',
        businessAddress: setting.businessAddress || 'Dhaka, Bangladesh',
      },
      preferences: setting.preferences || DEFAULT_PREFERENCES,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/', protect, [
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email address is required'),
  body('taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
], async (req, res, next) => {
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
    const userUpdate = {};
    if (name !== undefined && name.trim()) userUpdate.name = name.trim();
    if (email !== undefined && email.trim()) userUpdate.email = email.trim().toLowerCase();
    if (phone !== undefined) userUpdate.phone = phone.trim();
    if (avatar !== undefined) userUpdate.avatar = avatar;
    if (businessName !== undefined) userUpdate.businessName = businessName.trim();

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: userUpdate,
    });

    const existingSetting = await getOrCreateSetting(prisma, req.user.id);
    const settingData = {};
    if (businessName !== undefined) settingData.businessName = businessName.trim();
    if (currency !== undefined) settingData.currency = currency;
    if (taxRate !== undefined) settingData.taxRate = Number(taxRate);
    if (lowStockThresholdDefault !== undefined) {
      settingData.lowStockThresholdDefault = parseInt(lowStockThresholdDefault, 10) || 5;
    }
    if (businessEmail !== undefined) settingData.businessEmail = businessEmail;
    if (businessPhone !== undefined) settingData.businessPhone = businessPhone;
    if (businessAddress !== undefined) settingData.businessAddress = businessAddress;
    if (preferences && typeof preferences === 'object') {
      settingData.preferences = { ...(existingSetting.preferences || DEFAULT_PREFERENCES), ...preferences };
    }

    const setting = await prisma.setting.update({
      where: { id: existingSetting.id },
      data: settingData,
    });

    res.json({
      message: 'Settings updated successfully',
      user: { id: user.id, _id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
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
});

router.put('/password', protect, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }
    const { currentPassword, newPassword } = req.body;
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
    const hashedPassword = await bcrypt.hash(newPassword, rounds);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
