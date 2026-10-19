const { getPrisma } = require('../config/db');

/**
 * Standard Normal CDF approximation (Abramowitz & Stegun 7.1.26)
 * Used to compute calibrated stockout probability P(Demand_14d > CurrentStock).
 */
function normalCdf(z) {
  if (!Number.isFinite(z)) return 0.5;
  if (z < -6) return 0;
  if (z > 6) return 1;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

/**
 * Fits Holt's Linear Exponential Smoothing model on a 30-day daily demand series
 * via walk-forward grid search over (alpha, beta), and evaluates it against
 * a 7-day Simple Moving Average (SMA) baseline on the same out-of-sample steps.
 */
function fitHoltDemandModel(dailySeries, horizonDays = 14) {
  const n = dailySeries.length;
  const evalStart = 7; // evaluate walk-forward from day 8..30

  // 1. Evaluate 7-day SMA baseline via walk-forward validation
  const baselineErrors = [];
  for (let t = evalStart; t < n; t++) {
    let sum7 = 0;
    for (let k = t - 7; k < t; k++) sum7 += dailySeries[k];
    const predBaseline = sum7 / 7;
    baselineErrors.push(dailySeries[t] - predBaseline);
  }
  const maeBaseline = baselineErrors.reduce((s, e) => s + Math.abs(e), 0) / Math.max(baselineErrors.length, 1);
  const rmseBaseline = Math.sqrt(
    baselineErrors.reduce((s, e) => s + e * e, 0) / Math.max(baselineErrors.length, 1)
  );

  // 2. Grid-search Holt linear trend hyperparameters (alpha, beta)
  const alphas = [0.15, 0.3, 0.5, 0.7, 0.85];
  const betas = [0.05, 0.15, 0.3, 0.5];
  let best = null;

  for (const alpha of alphas) {
    for (const beta of betas) {
      let level = dailySeries[0] || 0;
      let trend = ((dailySeries[3] || 0) - (dailySeries[0] || 0)) / 3;
      const errors = [];

      for (let t = 1; t < n; t++) {
        const oneStepPred = Math.max(0, level + trend);
        if (t >= evalStart) {
          errors.push(dailySeries[t] - oneStepPred);
        }
        const prevLevel = level;
        level = alpha * dailySeries[t] + (1 - alpha) * (prevLevel + trend);
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
      }

      const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / Math.max(errors.length, 1);
      const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / Math.max(errors.length, 1));

      if (!best || mae < best.mae) {
        best = { alpha, beta, level, trend, mae, rmse, errors };
      }
    }
  }

  // 3. Multi-step ahead forecast over horizonDays
  let forecastHorizon = 0;
  for (let h = 1; h <= horizonDays; h++) {
    forecastHorizon += Math.max(0, best.level + h * best.trend);
  }

  // Residual standard deviation and 14-day demand uncertainty
  const residualVar = best.errors.reduce((s, e) => s + e * e, 0) / Math.max(best.errors.length, 1);
  const dailySigma = Math.sqrt(Math.max(residualVar, 0.04));
  const horizonSigma = Math.sqrt(horizonDays) * dailySigma;

  return {
    forecast14d: Number(forecastHorizon.toFixed(2)),
    horizonSigma: Number(horizonSigma.toFixed(2)),
    dailySigma: Number(dailySigma.toFixed(2)),
    level: Number(best.level.toFixed(3)),
    trendSlope: Number(best.trend.toFixed(4)),
    fittedAlpha: best.alpha,
    fittedBeta: best.beta,
    maeModel: Number(best.mae.toFixed(3)),
    rmseModel: Number(best.rmse.toFixed(3)),
    maeBaseline: Number(maeBaseline.toFixed(3)),
    rmseBaseline: Number(rmseBaseline.toFixed(3)),
  };
}

/**
 * Generates AI/ML inventory & sales insights from live PostgreSQL tables via Prisma.
 */
async function generateInsights() {
  const prisma = getPrisma();
  const now = new Date();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const DAYS_WINDOW = 30;
  const startWindow = new Date(now.getTime() - DAYS_WINDOW * 24 * 60 * 60 * 1000);

  const [products, salesThisMonth, salesLastMonth, sales30Days] = await Promise.all([
    prisma.product.findMany(),
    prisma.sale.findMany({ where: { createdAt: { gte: startThisMonth } } }),
    prisma.sale.findMany({ where: { createdAt: { gte: startLastMonth, lte: endLastMonth } } }),
    prisma.sale.findMany({
      where: { createdAt: { gte: startWindow } },
      include: { items: true },
    }),
  ]);

  const revenueThisMonth = salesThisMonth.reduce((s, x) => s + (x.total || 0), 0);
  const profitThisMonth = salesThisMonth.reduce((s, x) => s + (x.profit || 0), 0);
  const revenueLastMonth = salesLastMonth.reduce((s, x) => s + (x.total || 0), 0);

  const revenueChangePct = revenueLastMonth === 0
    ? (revenueThisMonth > 0 ? 100 : 0)
    : Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100);

  // Build 30-day chronological daily demand vectors per product
  const dailyBucketsByProduct = {};
  products.forEach(p => {
    dailyBucketsByProduct[String(p.id)] = new Array(DAYS_WINDOW).fill(0);
  });

  const salesByProduct = {};
  const revenueByProduct = {};
  const categoryStats = {};

  sales30Days.forEach(sale => {
    const saleTime = new Date(sale.createdAt).getTime();
    const dayIndex = Math.min(
      DAYS_WINDOW - 1,
      Math.max(0, Math.floor((saleTime - startWindow.getTime()) / (24 * 60 * 60 * 1000)))
    );

    (sale.items || []).forEach(it => {
      const id = String(it.productId || it.product);
      const qty = it.quantity || 0;
      const rev = it.subtotal || (it.unitPrice || it.price || 0) * qty;

      salesByProduct[id] = (salesByProduct[id] || 0) + qty;
      revenueByProduct[id] = (revenueByProduct[id] || 0) + rev;

      if (!dailyBucketsByProduct[id]) {
        dailyBucketsByProduct[id] = new Array(DAYS_WINDOW).fill(0);
      }
      dailyBucketsByProduct[id][dayIndex] += qty;

      const cat = it.category || 'General';
      if (!categoryStats[cat]) {
        categoryStats[cat] = { category: cat, unitsSold: 0, revenue: 0 };
      }
      categoryStats[cat].unitsSold += qty;
      categoryStats[cat].revenue += rev;
    });
  });

  const productMap = Object.fromEntries(products.map(p => [String(p.id), p]));
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

  // Train Holt linear time-series model across all products and evaluate vs 7-day SMA baseline
  const productForecasts = products.map(p => {
    const id = String(p.id);
    const series = dailyBucketsByProduct[id] || new Array(DAYS_WINDOW).fill(0);
    const sold30 = salesByProduct[id] || 0;
    const avgDaily = sold30 / DAYS_WINDOW;
    const threshold = p.lowStockThreshold ?? 5;
    const ml = fitHoltDemandModel(series, 14);

    // 95% service-level safety stock = z_0.95 * horizonSigma + threshold buffer
    const safetyStock = Math.max(Math.ceil(1.645 * ml.horizonSigma), threshold);
    const expected14dDemand = Math.max(Math.ceil(ml.forecast14d), Math.ceil(avgDaily * 14));
    const targetStock = Math.max(expected14dDemand + safetyStock, threshold * 6, 30);

    // Calibrated 14-day stockout probability P(D_14 > currentStock)
    const zScore = (expected14dDemand + threshold - p.stock) / Math.max(ml.horizonSigma, 1);
    const rawProb = p.stock === 0 ? 0.99 : normalCdf(zScore);
    const stockoutProbability = Math.min(99, Math.max(1, Math.round(rawProb * 100)));

    return {
      product: p,
      sold30,
      avgDaily: Number(avgDaily.toFixed(2)),
      threshold,
      ml,
      expected14dDemand,
      safetyStock,
      targetStock,
      stockoutProbability,
    };
  });

  // Aggregate model evaluation metrics across active products
  const activeModels = productForecasts.filter(f => f.sold30 > 0);
  const evalSet = activeModels.length > 0 ? activeModels : productForecasts;
  const avgMaeModel = Number(
    (evalSet.reduce((s, f) => s + f.ml.maeModel, 0) / Math.max(evalSet.length, 1)).toFixed(3)
  );
  const avgMaeBaseline = Number(
    (evalSet.reduce((s, f) => s + f.ml.maeBaseline, 0) / Math.max(evalSet.length, 1)).toFixed(3)
  );
  const avgRmseModel = Number(
    (evalSet.reduce((s, f) => s + f.ml.rmseModel, 0) / Math.max(evalSet.length, 1)).toFixed(3)
  );

  // Filter products requiring reorder (low stock OR high ML stockout risk >= 70%)
  const lowStockProducts = products.filter(p => p.stock <= (p.lowStockThreshold ?? 5));
  const recommendationCandidates = productForecasts.filter(
    f => f.product.stock <= f.threshold || f.stockoutProbability >= 70
  );

  const recommendations = recommendationCandidates
    .map(f => {
      const p = f.product;
      const suggested = Math.max(f.targetStock - p.stock, 10);
      let priority = 'Medium';
      if (p.stock === 0 || p.stock <= Math.floor(f.threshold / 2) || f.stockoutProbability >= 85) {
        priority = 'High';
      }
      const unitCost = p.cost || Math.round((p.price || 0) * 0.75);

      return {
        productId: p.id,
        product: p.name,
        category: p.category,
        stock: p.stock,
        lowStockThreshold: f.threshold,
        soldLast30: f.sold30,
        avgDaily: f.avgDaily,
        forecast14d: f.expected14dDemand,
        safetyStock: f.safetyStock,
        stockoutProbability: f.stockoutProbability,
        trendSlope: f.ml.trendSlope,
        maeModel: f.ml.maeModel,
        maeBaseline: f.ml.maeBaseline,
        suggested,
        estimatedCost: suggested * unitCost,
        priority,
        explainability: `14d Holt forecast: ${f.expected14dDemand} units (trend ${f.ml.trendSlope >= 0 ? '+' : ''}${f.ml.trendSlope}/day, α=${f.ml.fittedAlpha}, β=${f.ml.fittedBeta}), stockout risk ${f.stockoutProbability}%`,
        reason: p.stock === 0
          ? `Current stock: 0 (Out of stock · ${f.stockoutProbability}% stockout risk)`
          : `Current stock: ${p.stock} (14d forecast: ${f.expected14dDemand} units · ${f.stockoutProbability}% risk)`,
      };
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'High' ? -1 : 1;
      return b.stockoutProbability - a.stockoutProbability || a.stock - b.stock;
    });

  // Identify slow-moving products (in stock, 0 sales in last 30 days)
  const soldIds = new Set(Object.keys(salesByProduct));
  const slowMoving = products
    .filter(p => !soldIds.has(String(p.id)) && p.stock > 0)
    .map(p => {
      const unitCost = p.cost || Math.round((p.price || 0) * 0.75);
      return {
        productId: p.id,
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

  // Build dynamic Business Performance Summary from real data + ML forecast
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

  if (recommendations.length > 0) {
    parts.push(`${recommendations.length} product${recommendations.length > 1 ? 's' : ''} need immediate restocking based on 14-day demand forecasting.`);
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
    modelEvaluation: {
      methodology: "Holt's Double Exponential Smoothing (walk-forward grid search) + Gaussian Stockout Risk",
      baselineMethod: '7-Day Simple Moving Average (SMA)',
      horizonDays: 14,
      windowDays: DAYS_WINDOW,
      maeModel: avgMaeModel,
      rmseModel: avgRmseModel,
      maeBaseline: avgMaeBaseline,
      evaluatedProducts: evalSet.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { generateInsights, fitHoltDemandModel };
