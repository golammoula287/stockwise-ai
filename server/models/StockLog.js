const mongoose = require('mongoose');

const stockLogSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  category: { type: String },
  type: { type: String, enum: ['initial', 'sale', 'restock', 'adjustment'], required: true },
  change: { type: Number, required: true },
  previousStock: { type: Number, required: true },
  newStock: { type: Number, required: true },
  note: { type: String, default: '' },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

stockLogSchema.index({ createdAt: -1 });
stockLogSchema.index({ product: 1 });

module.exports = mongoose.model('StockLog', stockLogSchema);
