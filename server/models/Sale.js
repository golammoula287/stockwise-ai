const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  category: { type: String },
  price: { type: Number, required: true, min: 0 },
  cost: { type: Number, default: 0, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  subtotal: { type: Number, required: true, min: 0 },
  profit: { type: Number, default: 0 },
}, { _id: false });

const saleSchema = new mongoose.Schema({
  invoiceNumber: { type: String, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerName: { type: String, default: 'Walk-in Customer' },
  customerPhone: { type: String, default: '' },
  customerEmail: { type: String, default: '' },
  items: {
    type: [saleItemSchema],
    required: true,
    validate: [v => Array.isArray(v) && v.length > 0, 'At least one sale item is required'],
  },
  subtotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  totalCost: { type: Number, default: 0, min: 0 },
  profit: { type: Number, default: 0 },
  paymentMethod: { type: String, enum: ['cash', 'card', 'bkash', 'other'], default: 'cash' },
  soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

saleSchema.index({ createdAt: -1 });
saleSchema.index({ customer: 1 });

module.exports = mongoose.model('Sale', saleSchema);
