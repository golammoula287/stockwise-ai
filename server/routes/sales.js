const express = require('express');
const { getPrisma, isValidId } = require('../config/db');
const { protect } = require('../middleware/auth');

const router = express.Router();

const PAYMENT_METHOD_MAP = {
  cash: 'cash',
  card: 'card',
  bkash: 'bkash',
  nagad: 'other',
  other: 'other',
};

router.get('/', async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const { search, limit = 50, page = 1 } = req.query;
    const where = {};
    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { invoiceNumber: { contains: term, mode: 'insensitive' } },
        { customerName: { contains: term, mode: 'insensitive' } },
        { customerPhone: { contains: term, mode: 'insensitive' } },
      ];
    }
    const l = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const p = Math.max(parseInt(page, 10) || 1, 1);

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l,
      }),
      prisma.sale.count({ where }),
    ]);

    res.json({ sales, total, page: p, pages: Math.max(Math.ceil(total / l), 1) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid sale ID' });
    }
    const prisma = getPrisma();
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json(sale);
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, async (req, res, next) => {
  try {
    const {
      items,
      customerId,
      customer,
      customerName,
      customerPhone,
      customerEmail,
      discount = 0,
      paymentMethod = 'cash',
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one sale item is required' });
    }

    const normalizedPaymentMethod = PAYMENT_METHOD_MAP[String(paymentMethod).trim().toLowerCase()];
    if (!normalizedPaymentMethod) {
      return res.status(400).json({ message: 'Invalid payment method. Allowed: cash, card, bkash, other' });
    }

    const parsedDiscount = Number(discount || 0);
    if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0) {
      return res.status(400).json({ message: 'Discount must be a non-negative number' });
    }

    // Validate and merge duplicate product lines before entering DB transaction
    const mergedItemsMap = new Map();
    for (const item of items) {
      const pid = String(item.productId || item.product || '');
      if (!isValidId(pid)) {
        return res.status(400).json({ message: `Invalid product ID: ${pid}` });
      }
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({ message: 'Quantity must be a positive integer (at least 1)' });
      }
      mergedItemsMap.set(pid, (mergedItemsMap.get(pid) || 0) + qty);
    }

    const targetCustomerId = customerId || customer || null;
    if (targetCustomerId && !isValidId(String(targetCustomerId))) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }

    // Sort product IDs deterministically to prevent deadlocks under concurrent checkouts
    const sortedEntries = [...mergedItemsMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const prisma = getPrisma();

    const sale = await prisma.$transaction(async (tx) => {
      const deductedByProductId = new Map();

      // 1. Atomically verify and deduct stock for each product in deterministic order
      for (const [productId, qty] of sortedEntries) {
        const rows = await tx.$queryRaw`
          UPDATE "products"
          SET "stock" = "stock" - ${qty}, "updatedAt" = NOW()
          WHERE "id" = ${productId} AND "stock" >= ${qty}
          RETURNING "id", "name", "category", "price", "cost", "stock";
        `;

        if (!rows || rows.length === 0) {
          const exists = await tx.product.findUnique({ where: { id: productId } });
          if (!exists) {
            const notFound = new Error(`Product not found: ${productId}`);
            notFound.statusCode = 404;
            throw notFound;
          }
          const stockErr = new Error(
            `Insufficient stock for "${exists.name}" (available: ${exists.stock}, requested: ${qty})`
          );
          stockErr.statusCode = 400;
          throw stockErr;
        }

        const updatedProduct = rows[0];
        deductedByProductId.set(productId, {
          product: updatedProduct,
          qty,
          previousStock: updatedProduct.stock + qty,
          newStock: updatedProduct.stock,
        });
      }

      // Preserve original item order from request for line items
      let subtotal = 0;
      let totalCost = 0;
      const saleItemsData = [];

      for (const [productId, qty] of mergedItemsMap.entries()) {
        const entry = deductedByProductId.get(productId);
        const p = entry.product;
        const lineSubtotal = p.price * qty;
        const unitCost = p.cost || Math.round(p.price * 0.75);
        const lineCost = unitCost * qty;
        const lineProfit = lineSubtotal - lineCost;
        subtotal += lineSubtotal;
        totalCost += lineCost;

        saleItemsData.push({
          productId: p.id,
          name: p.name,
          category: p.category,
          quantity: qty,
          price: p.price,
          cost: unitCost,
          subtotal: lineSubtotal,
          profit: lineProfit,
        });
      }

      if (parsedDiscount > subtotal) {
        const discountErr = new Error('Discount cannot exceed order subtotal');
        discountErr.statusCode = 400;
        throw discountErr;
      }

      const cleanDiscount = parsedDiscount;
      const total = Math.max(subtotal - cleanDiscount, 0);
      const profit = total - totalCost;

      // 2. Resolve or upsert customer inside the same transaction
      let resolvedCustomer = null;
      let finalCustomerName = customerName && customerName.trim() ? customerName.trim() : 'Walk-in Customer';
      let finalCustomerPhone = customerPhone && customerPhone.trim() ? customerPhone.trim() : '';
      let finalCustomerEmail = customerEmail && customerEmail.trim() ? customerEmail.trim() : '';

      if (targetCustomerId) {
        resolvedCustomer = await tx.customer.findUnique({ where: { id: String(targetCustomerId) } });
      } else if (finalCustomerPhone) {
        resolvedCustomer = await tx.customer.findFirst({ where: { phone: finalCustomerPhone } });
      }

      if (resolvedCustomer) {
        resolvedCustomer = await tx.customer.update({
          where: { id: resolvedCustomer.id },
          data: {
            totalOrders: { increment: 1 },
            totalSpent: { increment: total },
          },
        });
        finalCustomerName = resolvedCustomer.name;
        finalCustomerPhone = resolvedCustomer.phone;
        finalCustomerEmail = resolvedCustomer.email || finalCustomerEmail;
      } else if (finalCustomerName !== 'Walk-in Customer' && finalCustomerPhone) {
        resolvedCustomer = await tx.customer.create({
          data: {
            name: finalCustomerName,
            phone: finalCustomerPhone,
            email: finalCustomerEmail || null,
            totalOrders: 1,
            totalSpent: total,
          },
        });
      }

      // 3. Atomically increment invoice sequence counter in PostgreSQL
      const existingCounter = await tx.counter.findUnique({ where: { id: 'invoiceNumber' } });
      if (!existingCounter) {
        const currentSaleCount = await tx.sale.count();
        await tx.$executeRaw`
          INSERT INTO "counters" ("id", "seq")
          VALUES ('invoiceNumber', ${1000 + currentSaleCount})
          ON CONFLICT ("id") DO NOTHING;
        `;
      }

      const counterRows = await tx.$queryRaw`
        UPDATE "counters"
        SET "seq" = "seq" + 1
        WHERE "id" = 'invoiceNumber'
        RETURNING "seq";
      `;
      const invoiceNumber = `INV-${Number(counterRows[0].seq)}`;

      // 4. Create Sale + SaleItem records
      const createdSale = await tx.sale.create({
        data: {
          invoiceNumber,
          customerId: resolvedCustomer ? resolvedCustomer.id : null,
          customerName: finalCustomerName,
          customerPhone: finalCustomerPhone,
          customerEmail: finalCustomerEmail,
          subtotal,
          discount: cleanDiscount,
          total,
          totalCost,
          profit,
          paymentMethod: normalizedPaymentMethod,
          soldById: req.user.id,
          items: {
            create: saleItemsData,
          },
        },
        include: { items: true },
      });

      // 5. Create StockLog audit entries for each deducted product
      for (const { product, qty, previousStock, newStock } of deductedByProductId.values()) {
        await tx.stockLog.create({
          data: {
            productId: product.id,
            productName: product.name,
            category: product.category,
            type: 'sale',
            change: -qty,
            previousStock,
            newStock,
            note: `Sale ${invoiceNumber}`,
            performedById: req.user.id,
          },
        });
      }

      return createdSale;
    });

    res.status(201).json(sale);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
});

module.exports = router;
