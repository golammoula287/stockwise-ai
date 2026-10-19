const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Customer = require('../models/Customer');
const StockLog = require('../models/StockLog');
const Counter = require('../models/Counter');
const { protect } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_PAYMENT_METHODS = ['cash', 'card', 'bkash', 'other'];

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 15, customer, search } = req.query;
    const q = {};
    if (customer && mongoose.Types.ObjectId.isValid(customer)) {
      q.customer = customer;
    }
    if (search && search.trim()) {
      q.$or = [
        { customerName: { $regex: search.trim(), $options: 'i' } },
        { invoiceNumber: { $regex: search.trim(), $options: 'i' } },
        { 'items.name': { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.max(parseInt(limit, 10) || 15, 1);
    const [total, sales] = await Promise.all([
      Sale.countDocuments(q),
      Sale.find(q)
        .populate('customer', 'name phone email')
        .populate('soldBy', 'name')
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l),
    ]);

    res.json({
      sales,
      total,
      page: p,
      pages: Math.max(Math.ceil(total / l), 1),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid sale ID' });
    }
    const s = await Sale.findById(req.params.id).populate('customer').populate('items.product');
    if (!s) return res.status(404).json({ message: 'Sale not found' });
    res.json(s);
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, async (req, res, next) => {
  const {
    customer,
    customerName,
    customerPhone,
    customerEmail,
    items,
    discount = 0,
    paymentMethod = 'cash',
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'At least one product item is required' });
  }

  if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ message: `Invalid payment method: ${paymentMethod}` });
  }

  const numDiscount = Number(discount);
  if (discount !== undefined && (Number.isNaN(numDiscount) || !Number.isFinite(numDiscount) || numDiscount < 0)) {
    return res.status(400).json({ message: 'Discount must be a non-negative number' });
  }
  const parsedDiscount = numDiscount || 0;

  // Validate and merge duplicate product entries in the request
  const mergedItemsMap = new Map();
  for (const it of items) {
    if (!it || !it.product || !mongoose.Types.ObjectId.isValid(it.product)) {
      return res.status(400).json({ message: 'Valid product ID is required for each item' });
    }
    const rawQty = typeof it.quantity === 'string' && it.quantity.trim() !== ''
      ? Number(it.quantity)
      : it.quantity;
    if (typeof rawQty !== 'number' || !Number.isInteger(rawQty) || rawQty < 1) {
      return res.status(400).json({ message: 'Item quantity must be a positive integer' });
    }
    const key = String(it.product);
    mergedItemsMap.set(key, (mergedItemsMap.get(key) || 0) + rawQty);
  }

  const session = await mongoose.startSession();
  let createdSaleId = null;

  try {
    await session.withTransaction(async () => {
      let subtotal = 0;
      let totalCost = 0;
      const saleItems = [];
      const deducted = [];

      // 1. Atomically verify and deduct stock per merged product inside the transaction
      for (const [productId, qty] of mergedItemsMap.entries()) {
        const beforeProduct = await Product.findOneAndUpdate(
          { _id: productId, stock: { $gte: qty } },
          { $inc: { stock: -qty } },
          { new: false, session }
        );

        if (!beforeProduct) {
          const existing = await Product.findById(productId).session(session);
          if (!existing) {
            throw createHttpError(404, `Product not found: ${productId}`);
          }
          throw createHttpError(
            400,
            `Insufficient stock for ${existing.name}: ${existing.stock} available, ${qty} requested`
          );
        }

        const prevStock = beforeProduct.stock;
        const newStock = prevStock - qty;
        const lineSubtotal = beforeProduct.price * qty;
        const unitCost = beforeProduct.cost || Math.round(beforeProduct.price * 0.75);
        const lineCost = unitCost * qty;
        const lineProfit = lineSubtotal - lineCost;

        subtotal += lineSubtotal;
        totalCost += lineCost;

        saleItems.push({
          product: beforeProduct._id,
          name: beforeProduct.name,
          category: beforeProduct.category,
          price: beforeProduct.price,
          cost: unitCost,
          quantity: qty,
          subtotal: lineSubtotal,
          profit: lineProfit,
        });

        deducted.push({
          id: beforeProduct._id,
          name: beforeProduct.name,
          category: beforeProduct.category,
          qty,
          prevStock,
          newStock,
        });
      }

      if (parsedDiscount > subtotal) {
        throw createHttpError(400, 'Discount cannot exceed sale subtotal');
      }

      const total = subtotal - parsedDiscount;
      const profit = total - totalCost;

      // 2. Update or create customer within the same transaction
      let resolvedCustomerId = customer && mongoose.Types.ObjectId.isValid(customer) ? customer : null;
      let resolvedCustomerName = customerName ? customerName.trim() : 'Walk-in Customer';
      let resolvedPhone = customerPhone ? customerPhone.trim() : '';
      let resolvedEmail = customerEmail ? customerEmail.trim().toLowerCase() : '';

      if (resolvedCustomerId) {
        const custDoc = await Customer.findByIdAndUpdate(
          resolvedCustomerId,
          { $inc: { totalSpent: total, totalOrders: 1 } },
          { new: true, session }
        );
        if (!custDoc) {
          throw createHttpError(404, 'Selected customer not found');
        }
        resolvedCustomerName = custDoc.name;
        resolvedPhone = custDoc.phone || resolvedPhone;
        resolvedEmail = custDoc.email || resolvedEmail;
      } else if (resolvedCustomerName && resolvedCustomerName !== 'Walk-in Customer' && resolvedPhone) {
        let custDoc = await Customer.findOne({ phone: resolvedPhone }).session(session);
        if (!custDoc) {
          const [createdCust] = await Customer.create(
            [{
              name: resolvedCustomerName,
              phone: resolvedPhone,
              email: resolvedEmail || undefined,
              totalSpent: total,
              totalOrders: 1,
            }],
            { session }
          );
          custDoc = createdCust;
        } else {
          custDoc.totalSpent = (custDoc.totalSpent || 0) + total;
          custDoc.totalOrders = (custDoc.totalOrders || 0) + 1;
          await custDoc.save({ session });
        }
        resolvedCustomerId = custDoc._id;
        resolvedCustomerName = custDoc.name;
      }

      // 3. Atomically increment invoice sequence counter
      const counter = await Counter.findByIdAndUpdate(
        'invoiceNumber',
        { $inc: { seq: 1 } },
        { new: true, upsert: true, session }
      );
      const invoiceNumber = `INV-${counter.seq}`;

      // 4. Create sale document inside the transaction
      const [createdSale] = await Sale.create(
        [{
          invoiceNumber,
          customer: resolvedCustomerId,
          customerName: resolvedCustomerName,
          customerPhone: resolvedPhone,
          customerEmail: resolvedEmail,
          items: saleItems,
          subtotal,
          discount: parsedDiscount,
          total,
          totalCost,
          profit,
          paymentMethod,
          soldBy: req.user._id,
        }],
        { session }
      );
      createdSaleId = createdSale._id;

      // 5. Record stock history entries inside the transaction
      await StockLog.insertMany(
        deducted.map(d => ({
          product: d.id,
          productName: d.name,
          category: d.category,
          type: 'sale',
          change: -d.qty,
          previousStock: d.prevStock,
          newStock: d.newStock,
          note: `Sale ${invoiceNumber} (${resolvedCustomerName})`,
          performedBy: req.user._id,
        })),
        { session }
      );
    });

    const populated = await Sale.findById(createdSaleId).populate('customer', 'name phone email');
    return res.status(201).json(populated);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    return next(err);
  } finally {
    await session.endSession();
  }
});

module.exports = router;
