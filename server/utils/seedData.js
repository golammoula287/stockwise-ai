const bcrypt = require('bcryptjs');
const { getPrisma } = require('../config/db');

async function seedDatabase({ force = false } = {}) {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase().trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || '';
  if (!adminEmail || adminPassword.length < 16 || /^(replace_with|change_me)/i.test(adminPassword)) {
    throw new Error('Set SEED_ADMIN_EMAIL and a unique SEED_ADMIN_PASSWORD of at least 16 characters before seeding');
  }
  const prisma = getPrisma();

  if (!force) {
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) return { seeded: false };
  } else {
    // Delete in foreign-key dependency order (only used in isolated test DB)
    await prisma.saleItem.deleteMany({});
    await prisma.stockLog.deleteMany({});
    await prisma.sale.deleteMany({});
    await prisma.setting.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.counter.deleteMany({});
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.create({
    data: {
      name: 'John Doe',
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      privateWorkspace: false,
      phone: '01712345678',
      businessName: 'StockWise AI',
    },
  });

  await prisma.setting.create({
    data: {
      userId: admin.id,
      businessName: 'StockWise AI',
      currency: '৳',
      taxRate: 0,
      lowStockThresholdDefault: 5,
      businessEmail: 'john@example.com',
      businessPhone: '01712345678',
      businessAddress: 'Banani, Dhaka, Bangladesh',
      preferences: {
        lowStockAlerts: true,
        emailReports: false,
        autoReorderSuggestions: true,
        dateFormat: 'MMM DD, YYYY',
      },
    },
  });

  const productSeedRows = [
    { name: 'Laptop', category: 'Electronics', price: 80000, cost: 65000, stock: 25, lowStockThreshold: 5, sku: 'LP-001', description: 'High-performance business laptop 16GB RAM 512GB SSD' },
    { name: 'Wireless Mouse', category: 'Accessories', price: 2500, cost: 1800, stock: 5, lowStockThreshold: 8, sku: 'MS-002', description: 'Ergonomic 2.4GHz optical wireless mouse' },
    { name: 'Keyboard', category: 'Accessories', price: 3500, cost: 2500, stock: 0, lowStockThreshold: 5, sku: 'KB-003', description: 'Mechanical RGB tactile keyboard' },
    { name: 'Monitor', category: 'Electronics', price: 20000, cost: 16000, stock: 12, lowStockThreshold: 5, sku: 'MN-004', description: '24-inch Full HD IPS borderless monitor' },
    { name: 'USB Cable', category: 'Accessories', price: 1000, cost: 600, stock: 50, lowStockThreshold: 10, sku: 'USB-005', description: 'Braided fast-charging USB-C cable' },
    { name: 'Laptop Bag', category: 'Accessories', price: 1800, cost: 1100, stock: 4, lowStockThreshold: 6, sku: 'BG-006', description: 'Water-resistant 15.6-inch laptop backpack' },
    { name: 'USB-C Hub', category: 'Accessories', price: 3200, cost: 2100, stock: 3, lowStockThreshold: 5, sku: 'HB-007', description: '7-in-1 multiport USB-C HDMI adapter' },
    { name: 'Webcam HD', category: 'Electronics', price: 4500, cost: 3200, stock: 18, lowStockThreshold: 5, sku: 'WC-008', description: '1080p Full HD streaming webcam with mic' },
    { name: 'Headphones', category: 'Audio', price: 6000, cost: 4200, stock: 20, lowStockThreshold: 5, sku: 'HP-009', description: 'Active noise-cancelling over-ear headphones' },
    { name: 'SSD 1TB', category: 'Storage', price: 9500, cost: 7500, stock: 15, lowStockThreshold: 5, sku: 'SD-010', description: 'NVMe M.2 Gen4 internal solid state drive' },
  ];

  const products = [];
  for (const row of productSeedRows) {
    const p = await prisma.product.create({ data: row });
    products.push(p);
  }

  const byName = Object.fromEntries(products.map(p => [p.name, p]));

  await prisma.stockLog.createMany({
    data: products.map(p => ({
      productId: p.id,
      productName: p.name,
      category: p.category,
      type: 'initial',
      change: p.stock,
      previousStock: 0,
      newStock: p.stock,
      note: 'Initial inventory seed',
      performedById: admin.id,
    })),
  });

  const customerSeedRows = [
    { name: 'Rahim Uddin', phone: '01711111111', email: 'rahim@example.com', address: 'Dhanmondi, Dhaka', totalSpent: 0, totalOrders: 0 },
    { name: 'Ayesha Khan', phone: '01722222222', email: 'ayesha@example.com', address: 'Gulshan, Dhaka', totalSpent: 0, totalOrders: 0 },
    { name: 'Tarek Islam', phone: '01733333333', email: 'tarek@example.com', address: 'Uttara, Dhaka', totalSpent: 0, totalOrders: 0 },
    { name: 'Nusrat Jahan', phone: '01744444444', email: 'nusrat@example.com', address: 'Mirpur, Dhaka', totalSpent: 0, totalOrders: 0 },
  ];

  const customers = [];
  for (const row of customerSeedRows) {
    const c = await prisma.customer.create({ data: row });
    customers.push(c);
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const buildSaleData = ({ customer, items, date, discount = 0, paymentMethod = 'cash', invoiceNumber }) => {
    const saleItems = items.map(it => {
      const p = byName[it.name];
      const price = it.overridePrice ?? p.price;
      const cost = p.cost || 0;
      const subtotal = price * it.quantity;
      const profit = (price - cost) * it.quantity;
      return {
        productId: p.id,
        name: p.name,
        category: p.category,
        price,
        cost,
        quantity: it.quantity,
        subtotal,
        profit,
      };
    });
    const subtotal = saleItems.reduce((s, x) => s + x.subtotal, 0);
    const totalCost = saleItems.reduce((s, x) => s + x.cost * x.quantity, 0);
    const total = Math.max(subtotal - discount, 0);
    const profit = total - totalCost;
    return {
      invoiceNumber,
      customerId: customer?.id || null,
      customerName: customer?.name || 'Walk-in Customer',
      customerPhone: customer?.phone || '',
      customerEmail: customer?.email || '',
      subtotal,
      discount,
      total,
      totalCost,
      profit,
      paymentMethod,
      soldById: admin.id,
      createdAt: date,
      updatedAt: date,
      items: {
        create: saleItems,
      },
    };
  };

  const historicalSales = [
    buildSaleData({
      invoiceNumber: 'INV-1001',
      customer: customers[0],
      items: [{ name: 'Laptop', quantity: 1 }, { name: 'Wireless Mouse', quantity: 2 }],
      date: new Date(currentYear, currentMonth - 1, 12, 11, 0),
    }),
    buildSaleData({
      invoiceNumber: 'INV-1002',
      customer: customers[1],
      items: [{ name: 'Monitor', quantity: 1 }, { name: 'Keyboard', quantity: 1 }],
      date: new Date(currentYear, currentMonth - 1, 19, 15, 30),
      discount: 2500,
    }),
    buildSaleData({
      invoiceNumber: 'INV-1003',
      customer: customers[0],
      items: [{ name: 'Laptop', quantity: 1 }],
      date: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
    }),
    buildSaleData({
      invoiceNumber: 'INV-1004',
      customer: customers[1],
      items: [{ name: 'Monitor', quantity: 1 }, { name: 'Keyboard', quantity: 2 }],
      date: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
    }),
    buildSaleData({
      invoiceNumber: 'INV-1005',
      customer: customers[2],
      items: [{ name: 'Keyboard', quantity: 3 }, { name: 'Wireless Mouse', quantity: 1 }],
      date: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      discount: 650,
    }),
    buildSaleData({
      invoiceNumber: 'INV-1006',
      customer: customers[3],
      items: [{ name: 'USB Cable', quantity: 1 }, { name: 'Laptop Bag', quantity: 1 }],
      date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      discount: 1150,
    }),
    buildSaleData({
      invoiceNumber: 'INV-1007',
      customer: customers[2],
      items: [{ name: 'USB Cable', quantity: 1 }],
      date: new Date(now.getTime() - 36 * 60 * 60 * 1000),
      discount: 200,
    }),
    buildSaleData({
      invoiceNumber: 'INV-1008',
      customer: customers[1],
      items: [{ name: 'Wireless Mouse', quantity: 1 }],
      date: new Date(now.getTime() - 20 * 60 * 60 * 1000),
    }),
    buildSaleData({
      invoiceNumber: 'INV-1009',
      customer: customers[3],
      items: [{ name: 'Monitor', quantity: 1 }],
      date: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    }),
  ];

  for (const saleData of historicalSales) {
    await prisma.sale.create({ data: saleData });
  }

  // Compute exact customer totalOrders and totalSpent from actual created sales
  for (const c of customers) {
    const agg = await prisma.sale.aggregate({
      where: { customerId: c.id },
      _count: { _all: true },
      _sum: { total: true },
    });
    await prisma.customer.update({
      where: { id: c.id },
      data: {
        totalOrders: agg._count._all || 0,
        totalSpent: agg._sum.total || 0,
      },
    });
  }

  await prisma.counter.upsert({
    where: { id: 'invoiceNumber' },
    update: { seq: 1009 },
    create: { id: 'invoiceNumber', seq: 1009 },
  });

  return { seeded: true, adminEmail: admin.email };
}

module.exports = { seedDatabase };
