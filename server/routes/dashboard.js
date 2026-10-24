const express = require('express');
const { getPrisma } = require('../config/db');
const { protect } = require('../middleware/auth');
const { formatCount, formatUnits } = require('../utils/formatters');

const router = express.Router();

router.use(protect);

function resolveDateRange(dateFilter, now = new Date()) {
  const f = String(dateFilter || 'This Month').trim().toLowerCase();
  const MS_DAY = 24 * 60 * 60 * 1000;

  if (f === 'today') {
    const startCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startPrev = new Date(startCurrent.getTime() - MS_DAY);
    const endPrev = new Date(startCurrent.getTime() - 1);
    return { label: 'Today', startCurrent, startPrev, endPrev, isAllTime: false };
  }

  if (f.includes('7') || f.includes('oct 17')) {
    const startCurrent = new Date(now.getTime() - 7 * MS_DAY);
    const startPrev = new Date(now.getTime() - 14 * MS_DAY);
    const endPrev = new Date(startCurrent.getTime() - 1);
    return { label: 'Last 7 Days', startCurrent, startPrev, endPrev, isAllTime: false };
  }

  if (f.includes('30')) {
    const startCurrent = new Date(now.getTime() - 30 * MS_DAY);
    const startPrev = new Date(now.getTime() - 60 * MS_DAY);
    const endPrev = new Date(startCurrent.getTime() - 1);
    return { label: 'Last 30 Days', startCurrent, startPrev, endPrev, isAllTime: false };
  }

  if (f.includes('all')) {
    return {
      label: 'All Time',
      startCurrent: new Date(0),
      startPrev: new Date(0),
      endPrev: new Date(0),
      isAllTime: true,
    };
  }

  // Default: This Month vs Last Month
  const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
  const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endPrev = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { label: 'This Month', startCurrent, startPrev, endPrev, isAllTime: false };
}

function computePctChange(currentVal, prevVal) {
  const cur = Number(currentVal) || 0;
  const prev = Number(prevVal) || 0;
  if (prev === 0) {
    return cur > 0 ? 100 : 0;
  }
  return Math.round(((cur - prev) / prev) * 100);
}

function buildLowStockAlertItems(lowStockProducts) {
  return lowStockProducts.map(p => {
    const threshold = p.lowStockThreshold ?? 5;
    return {
      id: p.id,
      product: p.name,
      sku: p.sku || null,
      category: p.category,
      stock: p.stock,
      threshold,
      severity: p.stock === 0 ? 'critical' : 'warning',
      message:
        p.stock === 0
          ? `${p.name} is out of stock (0 units remaining)`
          : `${p.name} has only ${formatUnits(p.stock)} left (threshold: ${formatUnits(threshold)})`,
    };
  });
}

router.get('/monthly', async (req, res, next) => {
  try {
    const { monthlyAnalytics, monthKeys, currentBusinessMonth } = await import('../../shared/dashboardAnalytics.mjs');
    const month = String(req.query.month || currentBusinessMonth());
    let keys; try { keys = monthKeys(month); } catch (_) { return res.status(400).json({ message: 'Choose a valid month.' }); }
    const [year, monthIndex] = month.split('-').map(Number);
    const start = new Date(`${keys.previousMonth}-01T00:00:00+06:00`);
    const end = new Date(Date.UTC(year, monthIndex, 1) - 6 * 60 * 60 * 1000);
    const prisma = getPrisma();
    const [products, sales, setting] = await Promise.all([
      prisma.product.findMany(),
      prisma.sale.findMany({ where: { createdAt: { gte: start, lt: end } }, include: { items: true } }),
      prisma.setting.findUnique({ where: { userId: req.user.id } }),
    ]);
    res.json(monthlyAnalytics({ products, sales, month, currency: setting?.currency || '৳' }));
  } catch (error) { next(error); }
});

router.get('/stats', async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const now = new Date();
    const { label, startCurrent, startPrev, endPrev, isAllTime } = resolveDateRange(
      req.query.dateFilter,
      now
    );

    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [
      products,
      totalSalesCount,
      periodSalesCount,
      prevSalesCount,
      periodAgg,
      prevAgg,
      allTimeAgg,
      setting,
    ] = await Promise.all([
      prisma.product.findMany(),
      prisma.sale.count(),
      prisma.sale.count({ where: { createdAt: { gte: startCurrent } } }),
      isAllTime
        ? Promise.resolve(0)
        : prisma.sale.count({ where: { createdAt: { gte: startPrev, lte: endPrev } } }),
      prisma.sale.aggregate({
        where: { createdAt: { gte: startCurrent } },
        _sum: { total: true, profit: true },
      }),
      isAllTime
        ? Promise.resolve({ _sum: { total: 0, profit: 0 } })
        : prisma.sale.aggregate({
            where: { createdAt: { gte: startPrev, lte: endPrev } },
            _sum: { total: true, profit: true },
          }),
      prisma.sale.aggregate({
        _sum: { total: true, profit: true },
      }),
      prisma.setting.findFirst({ where: { userId: req.user.id } }),
    ]);

    const totalProducts = products.length;
    const productsThisMonth = products.filter(p => new Date(p.createdAt) >= startThisMonth).length;
    const productsLastMonth = products.filter(
      p => new Date(p.createdAt) >= startLastMonth && new Date(p.createdAt) <= endLastMonth
    ).length;

    const lowStockProducts = products.filter(p => p.stock <= (p.lowStockThreshold ?? 5));
    const outOfStockProducts = products.filter(p => p.stock === 0);

    const periodRevenue = Math.round((periodAgg._sum.total || 0) * 100) / 100;
    const prevRevenue = Math.round((prevAgg._sum.total || 0) * 100) / 100;
    const allTimeRevenue = Math.round((allTimeAgg._sum.total || 0) * 100) / 100;
    const periodProfit = Math.round((periodAgg._sum.profit || 0) * 100) / 100;
    const allTimeProfit = Math.round((allTimeAgg._sum.profit || 0) * 100) / 100;

    const totalRevenue = isAllTime ? allTimeRevenue : periodRevenue;
    const totalProfit = isAllTime ? allTimeProfit : periodProfit;
    const filteredSalesCount = isAllTime ? totalSalesCount : periodSalesCount;

    const revenueChange = isAllTime ? 0 : computePctChange(periodRevenue, prevRevenue);
    const salesChange = isAllTime ? 0 : computePctChange(periodSalesCount, prevSalesCount);
    const productsChange = computePctChange(productsThisMonth, productsLastMonth);

    const lowStockAlertsEnabled = setting?.preferences?.lowStockAlerts !== false;
    const notifications = lowStockAlertsEnabled ? buildLowStockAlertItems(lowStockProducts) : [];
    const notificationsStatus = !lowStockAlertsEnabled
      ? 'disabled'
      : notifications.length === 0
      ? 'empty'
      : 'active';
    const notificationsMessage = !lowStockAlertsEnabled
      ? 'Low-stock notifications are disabled in Preferences.'
      : notifications.length === 0
      ? 'All products are well stocked.'
      : `${formatCount(notifications.length, 'low-stock alert')} active.`;

    res.json({
      dateFilter: label,
      currency: setting?.currency || '৳',
      totalProducts,
      totalSales: filteredSalesCount,
      allTimeSales: totalSalesCount,
      totalRevenue,
      totalProfit,
      allTimeRevenue,
      allTimeProfit,
      lowStockCount: lowStockProducts.length,
      outOfStockCount: outOfStockProducts.length,
      lowStockAlertsEnabled,
      notificationsStatus,
      notificationsMessage,
      changes: {
        products: productsChange,
        sales: salesChange,
        revenue: revenueChange,
      },
      notifications,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/recent-sales', async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const limit = Math.min(Math.max(parseInt(req.query.limit || '5', 10) || 5, 1), 25);
    const where = {};
    if (req.query.dateFilter) {
      const { startCurrent, isAllTime } = resolveDateRange(req.query.dateFilter);
      if (!isAllTime) {
        where.createdAt = { gte: startCurrent };
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        items: true,
        customer: { select: { name: true, phone: true } },
      },
    });

    const mapped = sales.map(s => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      customer: s.customer?.name || s.customerName || 'Walk-in Customer',
      amount: s.total,
      taxAmount: s.taxAmount ?? null,
      taxRate: s.taxRate ?? null,
      profit: s.profit || 0,
      itemsCount: (s.items || []).reduce((acc, i) => acc + i.quantity, 0),
      date: s.createdAt,
    }));

    res.json(mapped);
  } catch (err) {
    next(err);
  }
});

router.get('/sales-overview', async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const now = new Date();
    const range = String(req.query.range || 'This Year').trim();

    if (range === 'This Month' || range === 'Last 30 Days') {
      // Build 10 chronological 3-day buckets across the trailing 30 days from real PostgreSQL sales
      const MS_DAY = 24 * 60 * 60 * 1000;
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const start30d = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 29,
        0,
        0,
        0,
        0
      );

      const recentSales = await prisma.sale.findMany({
        where: { createdAt: { gte: start30d, lte: endOfToday } },
        select: { createdAt: true, total: true, profit: true },
      });

      const buckets = Array.from({ length: 10 }, (_, idx) => {
        const bucketStart = new Date(start30d.getTime() + idx * 3 * MS_DAY);
        const bucketEnd = new Date(start30d.getTime() + (idx * 3 + 2) * MS_DAY);
        const label = bucketEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return {
          month: label,
          start: bucketStart,
          end: new Date(bucketEnd.getFullYear(), bucketEnd.getMonth(), bucketEnd.getDate(), 23, 59, 59, 999),
          sales: 0,
          profit: 0,
          orders: 0,
        };
      });

      for (const s of recentSales) {
        const t = new Date(s.createdAt).getTime();
        const b = buckets.find(bucket => t >= bucket.start.getTime() && t <= bucket.end.getTime());
        if (b) {
          b.sales = Math.round((b.sales + (s.total || 0)) * 100) / 100;
          b.profit = Math.round((b.profit + (s.profit || 0)) * 100) / 100;
          b.orders += 1;
        }
      }

      return res.json(
        buckets.map(({ month, sales, profit, orders }) => ({ month, sales, profit, orders }))
      );
    }

    // Default / "This Year": 12 monthly buckets from real PostgreSQL sales (no fake baseline numbers)
    const year = now.getFullYear();
    const yearSales = await prisma.sale.findMany({
      where: { createdAt: { gte: new Date(year, 0, 1) } },
      select: { createdAt: true, total: true, profit: true },
    });

    const byMonth = {};
    for (const s of yearSales) {
      const m = new Date(s.createdAt).getMonth() + 1;
      if (!byMonth[m]) {
        byMonth[m] = { total: 0, profit: 0, orders: 0 };
      }
      byMonth[m].total = Math.round((byMonth[m].total + (s.total || 0)) * 100) / 100;
      byMonth[m].profit = Math.round((byMonth[m].profit + (s.profit || 0)) * 100) / 100;
      byMonth[m].orders += 1;
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = months.map((m, idx) => {
      const monthNum = idx + 1;
      const found = byMonth[monthNum];
      return {
        month: m,
        sales: found ? found.total : 0,
        profit: found ? found.profit : 0,
        orders: found ? found.orders : 0,
      };
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/notifications
 * Distinguishes between:
 *  - disabled: Low-stock notifications are disabled in Preferences.
 *  - empty:    All products are well stocked.
 *  - active:   Active low-stock/out-of-stock alerts.
 * Dashboard inventory counts (lowStockCount, outOfStockCount) remain independent of preference state (IMP-18).
 */
router.get('/notifications', async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const [products, setting] = await Promise.all([
      prisma.product.findMany(),
      prisma.setting.findFirst({ where: { userId: req.user.id } }),
    ]);

    const lowStockProducts = products.filter(p => p.stock <= (p.lowStockThreshold ?? 5));
    const outOfStockProducts = products.filter(p => p.stock === 0);

    const lowStockAlertsEnabled =
      req.query.force === 'true' ? true : setting?.preferences?.lowStockAlerts !== false;

    if (!lowStockAlertsEnabled) {
      return res.json({
        alertsEnabled: false,
        status: 'disabled',
        message: 'Low-stock notifications are disabled in Preferences.',
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length,
        notifications: [],
      });
    }

    const notifications = buildLowStockAlertItems(lowStockProducts);
    const status = notifications.length === 0 ? 'empty' : 'active';
    const message =
      notifications.length === 0
        ? 'All products are well stocked.'
        : `${formatCount(notifications.length, 'low-stock alert')} active.`;

    res.json({
      alertsEnabled: true,
      status,
      message,
      lowStockCount: lowStockProducts.length,
      outOfStockCount: outOfStockProducts.length,
      notifications,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
