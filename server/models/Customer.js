const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, sparse: true },
  phone: { type: String, required: true, trim: true },
  address: String,
  totalSpent: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
}, { timestamps: true });

customerSchema.index({ name: 'text', phone: 1 });

module.exports = mongoose.model('Customer', customerSchema);
