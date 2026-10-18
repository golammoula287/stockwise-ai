const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Setting = require('../models/Setting');
const { protect } = require('../middleware/auth');

const router = express.Router();

async function getOrCreateSetting(userId) {
  let setting = await Setting.findOne({ user: userId });
  if (!setting) {
    setting = await Setting.findOne();
  }
  if (!setting) {
    setting = await Setting.create({ user: userId });
  }
  return setting;
}

router.get('/', protect, async (req, res, next) => {
  try {
    const [user, setting] = await Promise.all([
      User.findById(req.user._id).select('name email phone businessName role avatar'),
      getOrCreateSetting(req.user._id),
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
      preferences: setting.preferences || {
        lowStockAlerts: true,
        emailReports: true,
        autoReorderSuggestions: true,
        dateFormat: 'MMM DD, YYYY',
      },
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

    const user = await User.findById(req.user._id);
    if (name !== undefined && name.trim()) user.name = name.trim();
    if (email !== undefined && email.trim()) user.email = email.trim().toLowerCase();
    if (phone !== undefined) user.phone = phone.trim();
    if (avatar !== undefined) user.avatar = avatar;
    if (businessName !== undefined) user.businessName = businessName.trim();
    await user.save();

    const setting = await getOrCreateSetting(req.user._id);
    if (businessName !== undefined) setting.businessName = businessName.trim();
    if (currency !== undefined) setting.currency = currency;
    if (taxRate !== undefined) setting.taxRate = Number(taxRate);
    if (lowStockThresholdDefault !== undefined) setting.lowStockThresholdDefault = Number(lowStockThresholdDefault);
    if (businessEmail !== undefined) setting.businessEmail = businessEmail;
    if (businessPhone !== undefined) setting.businessPhone = businessPhone;
    if (businessAddress !== undefined) setting.businessAddress = businessAddress;
    if (preferences && typeof preferences === 'object') {
      setting.preferences = { ...setting.preferences.toObject?.() || setting.preferences, ...preferences };
    }
    await setting.save();

    res.json({
      message: 'Settings updated successfully',
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role },
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
    const user = await User.findById(req.user._id).select('+password');
    const ok = await user.comparePassword(currentPassword);
    if (!ok) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
