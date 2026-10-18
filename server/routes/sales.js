const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Customer = require('../models/Customer');
const StockLog = require('../models/StockLog');
const { protect } = require('../middleware/auth');

const router = express.Router();

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
  try {
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
    const parsedDiscount = Math.max(Number(discount) || 0, 0);

    // 1. Validate every item and check stock availability
    let subtotal = 0;
    let totalCost = 0;
    const saleItems = [];
    const productSnapshots = [];

    for (const it of items) {
      if (!it.product || !mongoose.Types.ObjectId.isValid(it.product)) {
        return res.status(400).json({ message: 'Valid product ID is required for each item' });
      }
      const qty = parseInt(it.quantity, 10);
      if (!qty || qty < 1) {
        return res.status(400).json({ message: 'Item quantity must be at least 1' });
      }
      const product = await Product.findById(it.product);
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${it.product}` });
      }
      if (product.stock < qty) {
        return res.status(400).json({
          message: `Insufficient stock for ${product.name}: ${product.stock} available, ${qty} requested`,
        });
      }
      const lineSubtotal = product.price * qty;
      const unitCost = product.cost || Math.round(product.price * 0.75);
      const lineCost = unitCost * qty;
      const lineProfit = lineSubtotal - lineCost;

      subtotal += lineSubtotal;
      totalCost += lineCost;

      saleItems.push({
        product: product._id,
        name: product.name,
        category: product.category,
        price: product.price,
        cost: unitCost,
        quantity: qty,
        subtotal: lineSubtotal,
        profit: lineProfit,
      });
      productSnapshots.push({ product, qty });
    }

    const total = Math.max(subtotal - parsedDiscount, 0);
    const profit = total - totalCost;

    // 2. Atomically deduct stock for each item
    const deducted = [];
    for (const snap of productSnapshots) {
      const prevStock = snap.product.stock;
      const updated = await Product.findOneAndUpdate(
        { _id: snap.product._id, stock: { $gte: snap.qty } },
        { $inc: { stock: -snap.qty } },
        { new: true }
      );
      if (!updated) {
        // Rollback already deducted items
        for (const d of deducted) {
          await Product.findByIdAndUpdate(d.id, { $inc: { stock: d.qty } });
        }
        return res.status(400).json({ message: `Concurrent stock conflict for ${snap.product.name}` });
      }
      deducted.push({ id: snap.product._id, qty: snap.qty, prevStock, newStock: updated.stock, product: updated });
    }

    // 3. Resolve or create customer if inline info provided
    let resolvedCustomerId = customer && mongoose.Types.ObjectId.isValid(customer) ? customer : null;
    let resolvedCustomerName = customerName || 'Walk-in Customer';
    let resolvedPhone = customerPhone || '';
    let resolvedEmail = customerEmail || '';

    if (resolvedCustomerId) {
      const custDoc = await Customer.findByIdAndUpdate(
        resolvedCustomerId,
        { $inc: { totalSpent: total, totalOrders: 1 } },
        { new: true }
      );
      if (custDoc) {
        resolvedCustomerName = custDoc.name;
        resolvedPhone = custDoc.phone || resolvedPhone;
        resolvedEmail = custDoc.email || resolvedEmail;
      }
    } else if (customerName && customerName.trim() && customerPhone && customerPhone.trim()) {
      let custDoc = await Customer.findOne({ phone: customerPhone.trim() });
      if (!custDoc) {
        custDoc = await Customer.create({
          name: customerName.trim(),
          phone: customerPhone.trim(),
          email: customerEmail ? customerEmail.trim().toLowerCase() : undefined,
          totalSpent: total,
          totalOrders: 1,
        });
      } else {
        custDoc.totalSpent = (custDoc.totalSpent || 0) + total;
        custDoc.totalOrders = (custDoc.totalOrders || 0) + 1;
        await custDoc.save();
      }
      resolvedCustomerId = custDoc._id;
      resolvedCustomerName = custDoc.name;
    }

    const saleCount = await Sale.countDocuments();
    const invoiceNumber = `INV-${1001 + saleCount}`;

    const sale = await Sale.create({
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
    });

    // 4. Record stock history entries
    await StockLog.insertMany(deducted.map(d => ({
      product: d.id,
      productName: d.product.name,
      category: d.product.category,
      type: 'sale',
      change: -d.qty,
      previousStock: d.prevStock,
      newStock: d.newStock,
      note: `Sale ${invoiceNumber} (${resolvedCustomerName})`,
      performedBy: req.user._id,
    })));

    const populated = await sale.populate('customer', 'name phone email');
    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
