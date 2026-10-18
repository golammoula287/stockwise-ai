const Product = require('../models/Product');
const Sale = require('../models/Sale');

/**
 * AI-powered inventory & sales analysis engine.
 * Operates strictly on live MongoDB documents from Product and Sale collections.
 */
async function generateInsights() {
  const now = new Date();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [products, salesThisMonth, salesLastMonth, sales30Days] = await Promise.all([
    Product.find().lean(),
    Sale.find({ createdAt: { $gte: startThisMonth } }).lean(),
    Sale.find({ createdAt: { $gte: startLastMonth, $lte: endLastMonth } }).lean(),
    Sale.find({ createdAt: { $gte: thirtyDaysAgo } }).lean(),
  ]);

  const revenueThisMonth = salesThisMonth.reduce((s, x) => s + (x.total || 0), 0);
  const profitThisMonth = salesThisMonth.reduce((s, x) => s + (x.profit || 0), 0);
  const revenueLastMonth = salesLastMonth.reduce((s, x) => s + (x.total || 0), 0);

  const revenueChangePct = revenueLastMonth === 0
    ? (revenueThisMonth > 0 ? 100 : 0)
    : Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100);

  // Aggregate product sales over the last 30 days
  const salesByProduct = {};
  const revenueByProduct = {};
  const categoryStats = {};

  sales30Days.forEach(sale => {
    (sale.items || []).forEach(it => {
      const id = String(it.product);
      const qty = it.quantity || 0;
      const rev = it.subtotal || (it.price || 0) * qty;
      salesByProduct[id] = (salesByProduct[id] || 0) + qty;
      revenueByProduct[id] = (revenueByProduct[id] || 0) + rev;

      const cat = it.category || 'General';
      if (!categoryStats[cat]) {
        categoryStats[cat] = { category: cat, unitsSold: 0, revenue: 0 };
      }
      categoryStats[cat].unitsSold += qty;
      categoryStats[cat].revenue += rev;
    });
  });

  const productMap = Object.fromEntries(products.map(p => [String(p._id), p]));
  const maxSold = Math.max(...Object.values(salesByProduct), 1);

  const topProducts = Object.entries(salesByProduct)
    .map(([id, qty]) => {
      const prod = productMap[id];
      return {
        productId: id,
        name: prod?.name || 'Unknown Product',
        category: prod?.category || 'General',
        sold: qty,
        revenue: revenueByProduct[id] || 0,
        stock: prod?.stock ?? 0,
        sharePct: Math.round((qty / maxSold) * 100),
      };
    })
    .sort((a, b) => b.sold - a.sold || b.revenue - a.revenue)
    .slice(0, 5);

  // Calculate daily sales velocity and reorder recommendations
  const lowStockProducts = products.filter(p => p.stock <= (p.lowStockThreshold ?? 5));

  const recommendations = lowStockProducts
    .map(p => {
      const id = String(p._id);
      const sold30 = salesByProduct[id] || 0;
      const avgDaily = sold30 / 30;
      const threshold = p.lowStockThreshold ?? 5;
      // 14-day projected demand + safety stock buffer (2x threshold)
      const projected14d = Math.ceil(avgDaily * 14);
      const targetStock = Math.max(projected14d + threshold * 2, threshold * 6, 30);
      const suggested = Math.max(targetStock - p.stock, 10);

      let priority = 'Medium';
      if (p.stock === 0 || p.stock <= Math.floor(threshold / 2)) {
        priority = 'High';
      }

      const unitCost = p.cost || Math.round((p.price || 0) * 0.75);

      return {
        productId: p._id,
        product: p.name,
        category: p.category,
        stock: p.stock,
        lowStockThreshold: threshold,
        soldLast30: sold30,
        avgDaily: Number(avgDaily.toFixed(2)),
        suggested,
        estimatedCost: suggested * unitCost,
        priority,
        reason: p.stock === 0
          ? `Current stock: 0 (Out of stock)`
          : `Current stock: ${p.stock} (Threshold: ${threshold})`,
      };
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'High' ? -1 : 1;
      return a.stock - b.stock;
    });

  // Identify slow-moving products (in stock, 0 sales in last 30 days)
  const soldIds = new Set(Object.keys(salesByProduct));
  const slowMoving = products
    .filter(p => !soldIds.has(String(p._id)) && p.stock > 0)
    .map(p => {
      const unitCost = p.cost || Math.round((p.price || 0) * 0.75);
      return {
        productId: p._id,
        product: p.name,
        category: p.category,
        stock: p.stock,
        price: p.price,
        tiedCapital: p.stock * unitCost,
        soldLast30: 0,
        suggestion: p.stock >= 15
          ? 'Consider a 10-15% promotional discount or bundle offer'
          : 'Monitor demand over next 14 days before restocking',
      };
    })
    .sort((a, b) => b.tiedCapital - a.tiedCapital)
    .slice(0, 6);

  // Build dynamic Business Performance Summary from real data
  const parts = [];
  if (revenueChangePct > 0) {
    parts.push(`Your sales increased by ${revenueChangePct}% this month.`);
  } else if (revenueChangePct < 0) {
    parts.push(`Your sales decreased by ${Math.abs(revenueChangePct)}% this month.`);
  } else {
    parts.push('Your sales volume is steady this month.');
  }

  if (topProducts.length >= 2) {
    parts.push(`${topProducts[0].name} and ${topProducts[1].name} are the top performing products.`);
  } else if (topProducts.length === 1) {
    parts.push(`${topProducts[0].name} is the top performing product.`);
  }

  if (lowStockProducts.length > 0) {
    parts.push(`${lowStockProducts.length} product${lowStockProducts.length > 1 ? 's' : ''} need immediate restocking.`);
  } else {
    parts.push('All inventory stock levels are currently healthy.');
  }

  const totalUnitsSold30d = Object.values(salesByProduct).reduce((a, b) => a + b, 0);
  const averageOrderValue = sales30Days.length > 0
    ? Math.round(sales30Days.reduce((s, x) => s + (x.total || 0), 0) / sales30Days.length)
    : 0;

  return {
    summary: parts.join(' '),
    revenueThisMonth,
    profitThisMonth,
    revenueLastMonth,
    revenueChangePct,
    totalOrders30d: sales30Days.length,
    totalUnitsSold30d,
    averageOrderValue,
    topProducts,
    recommendations,
    lowStock: recommendations,
    lowStockCount: lowStockProducts.length,
    slowMoving,
    categoryBreakdown: Object.values(categoryStats).sort((a, b) => b.revenue - a.revenue),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { generateInsights };
