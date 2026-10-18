const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
  businessName: { type: String, default: 'StockPro' },
  currency: { type: String, default: '৳' },
  taxRate: { type: Number, default: 0, min: 0, max: 100 },
  lowStockThresholdDefault: { type: Number, default: 5, min: 0 },
  businessEmail: { type: String, default: 'info@stockpro.com' },
  businessPhone: { type: String, default: '01712345678' },
  businessAddress: { type: String, default: 'Dhaka, Bangladesh' },
  preferences: {
    lowStockAlerts: { type: Boolean, default: true },
    emailReports: { type: Boolean, default: true },
    autoReorderSuggestions: { type: Boolean, default: true },
    dateFormat: { type: String, default: 'MMM DD, YYYY' },
  },
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);
