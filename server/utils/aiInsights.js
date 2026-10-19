const { getPrisma } = require('../config/db');
const { formatCount, formatUnits } = require('./formatters');

/**
 * Standard Normal CDF approximation (Abramowitz & Stegun 7.1.26)
 * Computes calibrated stockout probability P(Demand_14d > CurrentStock) = Phi(z).
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
 * Calibrates 14-day stockout probability P(D_14 > currentStock) without adding
 * lowStockThreshold to the numerator (fixes IMP-01 and IMP-02).
 */
function computeCalibratedStockoutProbability({
  stock,
  forecast14dContinuous,
  horizonSigma,
  sold30,
}) {
  const currentStock = Math.max(0, Number(stock) || 0);
  const totalSold = Math.max(0, Number(sold30) || 0);
  const mu14 = Math.max(0, Number(forecast14dContinuous) || 0);

  // Already out of stock
  if (currentStock === 0) {
    return totalSold > 0 ? 99 : 95;
  }

  // Zero demand in trailing 30 days with positive stock on hand (fixes IMP-01: USB-C Hub)
  if (totalSold === 0 && mu14 < 0.05) {
    const latentMu14 = 0.25;
    const latentSigma14 = 0.85;
    const zLatent = (latentMu14 - currentStock) / latentSigma14;
    return Math.min(25, Math.max(1, Math.round(normalCdf(zLatent) * 100)));
  }

  // Combine walk-forward residual sigma with a Poisson demand-variance floor sqrt(mu14)
  // so sparse/single-order products never have artificially tiny variance.
  const effectiveSigma14 = Math.max(
    Number(horizonSigma) || 0,
    Math.sqrt(Math.max(mu14, 1.5)),
    1.5
  );

  // True stockout condition: Demand_14d > currentStock (fixes IMP-02: when mu14 == stock, z = 0 -> 50%)
  const zScore = (mu14 - currentStock) / effectiveSigma14;
  const prob = normalCdf(zScore);
  return Math.min(99, Math.max(1, Math.round(prob * 100)));
}

/**
 * Fits Holt's Linear Exponential Smoothing model on a daily demand series
 * via walk-forward grid search over (alpha, beta), and evaluates it against
 * a 7-day Simple Moving Average (SMA) baseline on the exact same out-of-sample window.
 * Includes sparse/intermittent demand protection to prevent single-day spikes from
 * extrapolating unrealistic 14-day trends.
 */
function fitHoltDemandModel(dailySeries, horizonDays = 14) {
  const series = Array.isArray(dailySeries)
    ? dailySeries.map(v => Math.max(0, Number(v) || 0))
    : new Array(30).fill(0);
  const n = series.length;
  const evalStart = Math.min(7, Math.max(1, n - 1));
  const totalSold = series.reduce((s, v) => s + v, 0);
  const activeDays = series.filter(v => v > 0).length;
  const avgDaily = n > 0 ? totalSold / n : 0;

  // 1. Evaluate 7-day SMA baseline via strict walk-forward validation (days evalStart .. n-1)
  const baselineErrors = [];
  for (let t = evalStart; t < n; t++) {
    const windowLen = Math.min(7, t);
    let sumW = 0;
    for (let k = t - windowLen; k < t; k++) sumW += series[k];
    const predBaseline = sumW / windowLen;
    baselineErrors.push(series[t] - predBaseline);
  }
  const maeBaseline =
    baselineErrors.reduce((s, e) => s + Math.abs(e), 0) / Math.max(baselineErrors.length, 1);
  const rmseBaseline = Math.sqrt(
    baselineErrors.reduce((s, e) => s + e * e, 0) / Math.max(baselineErrors.length, 1)
  );

  // Zero-sales shortcut: no demand observed across window
  if (totalSold === 0) {
    return {
      forecast14d: 0,
      forecast14dContinuous: 0,
      forecast7dContinuous: 0,
      horizonSigma: 0.75,
      leadTimeSigma: 0.53,
      dailySigma: 0.2,
      level: 0,
      trendSlope: 0,
      fittedAlpha: 0.15,
      fittedBeta: 0.05,
      maeModel: 0,
      rmseModel: 0,
      maeBaseline: 0,
      rmseBaseline: 0,
      activeDays: 0,
      selectedModel: 'Zero-Demand Baseline',
    };
  }

  // 2. Grid-search Holt linear trend hyperparameters (alpha, beta) on out-of-sample steps t = evalStart..n-1
  const alphas = [0.1, 0.2, 0.35, 0.5, 0.7];
  const betas = [0.05, 0.1, 0.2, 0.3];
  let best = null;

  // Warm-up initialization from first min(4, evalStart) observations without leaking future steps
  const initLen = Math.min(4, evalStart);
  let initSum = 0;
  for (let i = 0; i < initLen; i++) initSum += series[i];
  const initLevel = initSum / Math.max(initLen, 1);
  const initTrend =
    initLen >= 4 ? ((series[3] + series[2]) / 2 - (series[1] + series[0]) / 2) / 2 * 0.5 : 0;

  for (const alpha of alphas) {
    for (const beta of betas) {
      let level = initLevel;
      let trend = initTrend;
      const errors = [];

      for (let t = 1; t < n; t++) {
        // Out-of-sample 1-step-ahead prediction using ONLY state through t - 1
        const oneStepPred = Math.max(0, level + trend);
        if (t >= evalStart) {
          errors.push(series[t] - oneStepPred);
        }
        const prevLevel = level;
        level = alpha * series[t] + (1 - alpha) * (prevLevel + trend);
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
      }

      const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / Math.max(errors.length, 1);
      const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / Math.max(errors.length, 1));

      // Prefer strictly lower MAE (with 1e-6 tolerance so ties prefer smoother, lower alpha/beta)
      if (!best || mae < best.mae - 1e-6) {
        best = { alpha, beta, level, trend, mae, rmse, errors };
      }
    }
  }

  // 3. Multi-step ahead forecast over horizonDays with evidence-based sparse-demand damping
  const isSparse = activeDays <= 2;
  const dampingPhi = isSparse ? 0.5 : 0.85;

  let holtHorizon = 0;
  let holtLeadTime7d = 0;
  let phiPower = 1;
  for (let h = 1; h <= horizonDays; h++) {
    phiPower *= dampingPhi;
    const stepPred = Math.max(0, best.level + phiPower * best.trend);
    holtHorizon += stepPred;
    if (h <= 7) holtLeadTime7d += stepPred;
  }

  // Empirical rate projection over horizonDays
  const empiricalHorizon = avgDaily * horizonDays;
  const empiricalLeadTime7d = avgDaily * Math.min(7, horizonDays);

  let finalHorizonContinuous = holtHorizon;
  let finalLeadTime7dContinuous = holtLeadTime7d;
  let selectedModel = "Holt's Linear Exponential Smoothing";

  if (isSparse) {
    // For sparse/intermittent demand (1-2 sales days in 30d), blend damped Holt with empirical rate
    // and cap at 1.25x empirical rate so a single spike on day 29 cannot inflate 3x.
    finalHorizonContinuous = Math.min(
      0.5 * holtHorizon + 0.5 * empiricalHorizon,
      empiricalHorizon * 1.25
    );
    finalLeadTime7dContinuous = finalHorizonContinuous * (Math.min(7, horizonDays) / horizonDays);
    selectedModel = 'Damped Holt + Empirical Rate (Sparse Demand)';
  } else if (maeBaseline + 0.005 < best.mae) {
    // Evidence-based fallback when 7-day SMA outperforms Holt on walk-forward MAE
    const last7Sum = series.slice(Math.max(0, n - 7)).reduce((s, v) => s + v, 0);
    const smaDaily = (last7Sum / Math.min(7, n)) * 0.6 + avgDaily * 0.4;
    finalHorizonContinuous = smaDaily * horizonDays;
    finalLeadTime7dContinuous = smaDaily * Math.min(7, horizonDays);
    selectedModel = '7-Day SMA + Empirical Blend (Lower MAE Fallback)';
  }

  finalHorizonContinuous = Math.max(0, finalHorizonContinuous);
  finalLeadTime7dContinuous = Math.max(0, finalLeadTime7dContinuous);

  // Residual standard deviation and horizon demand uncertainty
  const residualVar =
    best.errors.reduce((s, e) => s + e * e, 0) / Math.max(best.errors.length, 1);
  const dailySigma = Math.sqrt(Math.max(residualVar, 0.04));
  const horizonSigma = Math.max(
    Math.sqrt(horizonDays) * dailySigma,
    Math.sqrt(Math.max(finalHorizonContinuous, 0.5))
  );
  const leadTimeSigma = Math.max(
    Math.sqrt(Math.min(7, horizonDays)) * dailySigma,
    Math.sqrt(Math.max(finalLeadTime7dContinuous, 0.5))
  );

  return {
    forecast14d: Math.round(finalHorizonContinuous),
    forecast14dContinuous: Number(finalHorizonContinuous.toFixed(2)),
    forecast7dContinuous: Number(finalLeadTime7dContinuous.toFixed(2)),
    horizonSigma: Number(horizonSigma.toFixed(2)),
    leadTimeSigma: Number(leadTimeSigma.toFixed(2)),
    dailySigma: Number(dailySigma.toFixed(2)),
    level: Number(best.level.toFixed(3)),
    trendSlope: Number(best.trend.toFixed(4)),
    fittedAlpha: best.alpha,
    fittedBeta: best.beta,
    maeModel: Number(best.mae.toFixed(3)),
    rmseModel: Number(best.rmse.toFixed(3)),
    maeBaseline: Number(maeBaseline.toFixed(3)),
    rmseBaseline: Number(rmseBaseline.toFixed(3)),
    activeDays,
    selectedModel,
  };
}

/**
 * Generates AI/ML inventory & sales insights from live PostgreSQL tables via Prisma.
 */
async function generateInsights(options = {}) {
  const prisma = getPrisma();
  const now = new Date();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  // Build 30 consecutive calendar-day window ending today at 23:59:59.999
  const DAYS_WINDOW = 30;
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startWindow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (DAYS_WINDOW - 1),
    0,
    0,
    0,
    0
  );
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const [products, salesThisMonth, salesLastMonth, sales30Days, setting] = await Promise.all([
    prisma.product.findMany(),
    prisma.sale.findMany({ where: { createdAt: { gte: startThisMonth } } }),
    prisma.sale.findMany({ where: { createdAt: { gte: startLastMonth, lte: endLastMonth } } }),
    prisma.sale.findMany({
      where: { createdAt: { gte: startWindow, lte: endOfToday } },
      include: { items: true },
    }),
    prisma.setting.findFirst(),
  ]);

  const autoReorderEnabled =
    options.forceRecommendations === true
      ? true
      : setting?.preferences?.autoReorderSuggestions !== false;

  const revenueThisMonth = salesThisMonth.reduce((s, x) => s + (x.total || 0), 0);
  const profitThisMonth = salesThisMonth.reduce((s, x) => s + (x.profit || 0), 0);
  const revenueLastMonth = salesLastMonth.reduce((s, x) => s + (x.total || 0), 0);

  const revenueChangePct =
    revenueLastMonth === 0
      ? revenueThisMonth > 0
        ? 100
        : 0
      : Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100);

  // Initialize 30 calendar-day demand vectors per product with 0s (explicit missing-date handling)
  const dailyBucketsByProduct = {};
  products.forEach(p => {
    dailyBucketsByProduct[String(p.id)] = new Array(DAYS_WINDOW).fill(0);
  });

  const salesByProduct = {};
  const revenueByProduct = {};
  const categoryStats = {};

  sales30Days.forEach(sale => {
    const d = new Date(sale.createdAt);
    const saleDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const dayIndex = Math.min(
      DAYS_WINDOW - 1,
      Math.max(0, Math.round((saleDayStart.getTime() - startWindow.getTime()) / MS_PER_DAY))
    );

    (sale.items || []).forEach(it => {
      const id = String(it.productId || it.product);
      const qty = Math.max(0, Number(it.quantity) || 0);
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

  const LEAD_TIME_DAYS = 7;

  // Fit forecasting pipeline across all products and evaluate vs 7-day SMA baseline
  const productForecasts = products.map(p => {
    const id = String(p.id);
    const series = dailyBucketsByProduct[id] || new Array(DAYS_WINDOW).fill(0);
    const sold30 = salesByProduct[id] || 0;
    const avgDaily = sold30 / DAYS_WINDOW;
    const threshold = p.lowStockThreshold ?? 5;
    const ml = fitHoltDemandModel(series, 14);

    const forecast14dContinuous = ml.forecast14dContinuous;
    const expected14dDemand = Math.round(forecast14dContinuous);
    const leadTimeDemand = Math.round(ml.forecast7dContinuous);

    // 95% service-level safety stock over 7-day replenishment lead time
    const safetyStock = Math.max(Math.ceil(1.645 * ml.leadTimeSigma), threshold);
    const reorderPoint = leadTimeDemand + safetyStock;

    // Target stock after replenishment:
    // - For zero-demand items below threshold, replenish to threshold + modest buffer (not 30!)
    // - For active-demand items, replenish to cover 14-day demand + safety stock
    const targetStock =
      sold30 === 0
        ? threshold + Math.max(Math.ceil(threshold * 0.6), 4)
        : Math.max(expected14dDemand + safetyStock, threshold + 5);

    const stockoutProbability = computeCalibratedStockoutProbability({
      stock: p.stock,
      forecast14dContinuous,
      horizonSigma: ml.horizonSigma,
      sold30,
    });

    const daysOfStockLeft =
      p.stock === 0
        ? 0
        : avgDaily > 0
        ? Math.min(365, Math.round(p.stock / avgDaily))
        : null;

    return {
      product: p,
      sold30,
      avgDaily: Number(avgDaily.toFixed(2)),
      threshold,
      ml,
      forecast14dContinuous,
      expected14dDemand,
      leadTimeDays: LEAD_TIME_DAYS,
      leadTimeDemand,
      safetyStock,
      reorderPoint,
      targetStock,
      stockoutProbability,
      daysOfStockLeft,
    };
  });

  // Aggregate model evaluation metrics across active products (sold30 > 0)
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

  // Separate actual low-stock threshold alerts, eligible forecast reorders, and enabled recommendations (IMP-03 & IMP-17)
  const lowStockProducts = products.filter(p => p.stock <= (p.lowStockThreshold ?? 5));
  const allEligibleCandidates = productForecasts.filter(
    f =>
      f.product.stock <= f.threshold ||
      (f.sold30 > 0 && (f.product.stock < f.reorderPoint || f.stockoutProbability >= 60))
  );

  const actualThresholdAlertCount = lowStockProducts.length;
  const eligibleForecastReorderCount = allEligibleCandidates.filter(
    f => f.product.stock > f.threshold
  ).length;
  const eligibleRecommendationCount = allEligibleCandidates.length;

  const mappedRecommendations = allEligibleCandidates
    .map(f => {
      const p = f.product;
      const isBelowThreshold = p.stock <= f.threshold;
      const triggerType = isBelowThreshold ? 'threshold' : 'forecast';
      const suggested = Math.max(f.targetStock - p.stock, Math.max(f.threshold - p.stock + 2, 5));

      let priority = 'Medium';
      if (p.stock === 0 || (isBelowThreshold && p.stock <= Math.floor(f.threshold / 2)) || f.stockoutProbability >= 75) {
        priority = 'High';
      } else if (!isBelowThreshold && f.stockoutProbability < 45) {
        priority = 'Low';
      }

      const unitCost = p.cost || Math.round((p.price || 0) * 0.75);

      const explainability =
        f.sold30 === 0
          ? `Below low-stock threshold (${p.stock} ≤ ${f.threshold}); 0 units sold in last 30d · 14d forecast: 0 units (${f.stockoutProbability}% 14d stockout risk)`
          : `${f.ml.selectedModel}: 14d forecast ${formatUnits(f.forecast14dContinuous)} (${formatUnits(f.expected14dDemand, '~')}, trend ${f.ml.trendSlope >= 0 ? '+' : ''}${f.ml.trendSlope}/day), ROP ${f.reorderPoint} (7d lead time + ${f.safetyStock} safety stock), 14d stockout risk ${f.stockoutProbability}%`;

      return {
        productId: p.id,
        product: p.name,
        sku: p.sku || null,
        category: p.category,
        stock: p.stock,
        lowStockThreshold: f.threshold,
        triggerType,
        triggerLabel: isBelowThreshold ? 'Low-Stock Threshold Alert' : 'Proactive Demand Forecast',
        soldLast30: f.sold30,
        avgDaily: f.avgDaily,
        forecast14d: f.expected14dDemand,
        forecast14dContinuous: f.forecast14dContinuous,
        leadTimeDays: f.leadTimeDays,
        leadTimeDemand: f.leadTimeDemand,
        safetyStock: f.safetyStock,
        reorderPoint: f.reorderPoint,
        targetStock: f.targetStock,
        daysOfStockLeft: f.daysOfStockLeft,
        stockoutProbability: f.stockoutProbability,
        trendSlope: f.ml.trendSlope,
        selectedModel: f.ml.selectedModel,
        maeModel: f.ml.maeModel,
        maeBaseline: f.ml.maeBaseline,
        suggested,
        estimatedCost: Math.round(suggested * unitCost),
        priority,
        explainability,
        reason:
          p.stock === 0
            ? `Out of stock (0 units) · 14d forecast: ${formatUnits(f.expected14dDemand)} (${f.stockoutProbability}% stockout risk)`
            : isBelowThreshold
            ? `Below threshold (${p.stock}/${f.threshold}) · 14d forecast: ${formatUnits(f.expected14dDemand)} (${f.stockoutProbability}% risk)`
            : `Proactive reorder (stock ${p.stock} < ROP ${f.reorderPoint}) · 14d forecast: ${formatUnits(f.expected14dDemand)} (${f.stockoutProbability}% risk)`,
      };
    })
    .sort((a, b) => {
      const rank = { High: 0, Medium: 1, Low: 2 };
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
      if (a.stock === 0 && b.stock !== 0) return -1;
      if (b.stock === 0 && a.stock !== 0) return 1;
      return b.stockoutProbability - a.stockoutProbability || a.stock - b.stock;
    });

  const recommendations = autoReorderEnabled ? mappedRecommendations : [];
  const enabledRecommendationCount = recommendations.length;
  const recommendationState = autoReorderEnabled ? 'enabled' : 'disabled';

  const disabledStatusMessage =
    actualThresholdAlertCount > 0
      ? `${formatCount(actualThresholdAlertCount, 'product is', 'products are')} below ${
          actualThresholdAlertCount === 1 ? 'its low-stock threshold' : 'their low-stock thresholds'
        }. Automated reorder recommendations are disabled in Preferences.`
      : 'All products are above their low-stock thresholds. Automated reorder recommendations are disabled in Preferences.';

  // Identify slow-moving products (in stock, 0 sales in last 30 days)
  const soldIds = new Set(Object.keys(salesByProduct));
  const slowMoving = products
    .filter(p => !soldIds.has(String(p.id)) && p.stock > 0)
    .map(p => {
      const unitCost = p.cost || Math.round((p.price || 0) * 0.75);
      return {
        productId: p.id,
        product: p.name,
        sku: p.sku || null,
        category: p.category,
        stock: p.stock,
        price: p.price,
        tiedCapital: Math.round(p.stock * unitCost),
        soldLast30: 0,
        suggestion:
          p.stock >= 15
            ? 'Consider a 10-15% promotional discount or bundle offer'
            : p.stock <= (p.lowStockThreshold ?? 5)
            ? 'Below low-stock threshold with 0 recent sales — verify demand before large restock'
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

  if (!autoReorderEnabled) {
    parts.push(disabledStatusMessage);
  } else if (recommendations.length > 0) {
    if (eligibleForecastReorderCount > 0) {
      parts.push(
        `${formatCount(recommendations.length, 'product is', 'products are')} flagged for restocking (${formatCount(actualThresholdAlertCount, 'low-stock threshold alert')} + ${formatCount(eligibleForecastReorderCount, 'proactive 14-day demand forecast')}).`
      );
    } else {
      parts.push(
        `${formatCount(recommendations.length, 'product needs', 'products need')} restocking based on low-stock thresholds and 14-day demand forecasting.`
      );
    }
  } else {
    parts.push('All inventory stock levels are currently healthy.');
  }

  const totalUnitsSold30d = Object.values(salesByProduct).reduce((a, b) => a + b, 0);
  const averageOrderValue =
    sales30Days.length > 0
      ? Math.round(sales30Days.reduce((s, x) => s + (x.total || 0), 0) / sales30Days.length)
      : 0;

  return {
    summary: parts.join(' '),
    autoReorderEnabled,
    recommendationState,
    disabledMessage: autoReorderEnabled ? null : disabledStatusMessage,
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
    lowStockCount: actualThresholdAlertCount,
    thresholdAlertCount: actualThresholdAlertCount,
    forecastReorderCount: eligibleForecastReorderCount,
    eligibleForecastReorderCount,
    eligibleRecommendationCount,
    enabledRecommendationCount,
    slowMoving,
    categoryBreakdown: Object.values(categoryStats).sort((a, b) => b.revenue - a.revenue),
    modelEvaluation: {
      methodology:
        "Holt's Double Exponential Smoothing (walk-forward grid search + sparse-demand damping) & Calibrated Gaussian Stockout Risk",
      baselineMethod: '7-Day Simple Moving Average (SMA)',
      horizonDays: 14,
      leadTimeDays: LEAD_TIME_DAYS,
      windowDays: DAYS_WINDOW,
      evaluationStepsOutOfSample: DAYS_WINDOW - 7,
      maeModel: avgMaeModel,
      rmseModel: avgRmseModel,
      maeBaseline: avgMaeBaseline,
      evaluatedProducts: evalSet.length,
      assumptionsAndLimitations: [
        'Daily demand is bucketed across the trailing 30 calendar days with explicit zero-filling for days without sales.',
        'Walk-forward validation evaluates 1-step-ahead out-of-sample predictions across days 8–30 (23 steps) with zero look-ahead leakage.',
        'Products with sparse/intermittent demand (≤2 active sales days in 30d) use damped trend and empirical rate blending to prevent single-order trend overshooting.',
        'Stockout probability P(Demand_14d > CurrentStock) is calibrated via a Gaussian CDF with a Poisson variance floor; it does not model external supplier delays beyond the 7-day lead time or multi-month holiday seasonality.',
      ],
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  generateInsights,
  fitHoltDemandModel,
  computeCalibratedStockoutProbability,
  normalCdf,
};
