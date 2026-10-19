const { getPrisma } = require('../config/db');
const { generateInsights } = require('./aiInsights');
const { roundMoney } = require('./formatters');

/**
 * Resolves a human-readable date range into start/end Date objects in local server time.
 * Matches Dashboard (server/routes/dashboard.js) date boundaries so numbers are 100% consistent.
 */
function resolveChatDateRange(periodInput = 'this_month', now = new Date()) {
  const raw = String(periodInput || 'this_month').trim().toLowerCase();
  const MS_DAY = 24 * 60 * 60 * 1000;

  if (raw === 'today' || raw.includes('today') || raw.includes('আজ')) {
    const startCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startPrev = new Date(startCurrent.getTime() - MS_DAY);
    const endPrev = new Date(startCurrent.getTime() - 1);
    return {
      periodKey: 'today',
      label: 'Today',
      startCurrent,
      endCurrent: now,
      startPrev,
      endPrev,
      isAllTime: false,
    };
  }

  if (
    raw === 'this_week' ||
    raw === 'last_7_days' ||
    raw.includes('week') ||
    raw.includes('7') ||
    raw.includes('সপ্তাহ')
  ) {
    const startCurrent = new Date(now.getTime() - 7 * MS_DAY);
    const startPrev = new Date(now.getTime() - 14 * MS_DAY);
    const endPrev = new Date(startCurrent.getTime() - 1);
    return {
      periodKey: 'last_7_days',
      label: 'Last 7 Days (This Week)',
      startCurrent,
      endCurrent: now,
      startPrev,
      endPrev,
      isAllTime: false,
    };
  }

  if (raw === 'last_30_days' || raw.includes('30')) {
    const startCurrent = new Date(now.getTime() - 30 * MS_DAY);
    const startPrev = new Date(now.getTime() - 60 * MS_DAY);
    const endPrev = new Date(startCurrent.getTime() - 1);
    return {
      periodKey: 'last_30_days',
      label: 'Last 30 Days',
      startCurrent,
      endCurrent: now,
      startPrev,
      endPrev,
      isAllTime: false,
    };
  }

  if (raw === 'all_time' || raw.includes('all') || raw.includes('সব')) {
    return {
      periodKey: 'all_time',
      label: 'All Time',
      startCurrent: new Date(0),
      endCurrent: now,
      startPrev: new Date(0),
      endPrev: new Date(0),
      isAllTime: true,
    };
  }

  // Default: This Month (calendar month-to-date)
  const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const endPrev = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return {
    periodKey: 'this_month',
    label: 'This Month',
    startCurrent,
    endCurrent: now,
    startPrev,
    endPrev,
    isAllTime: false,
  };
}

function computePctChange(currentVal, prevVal) {
  const cur = Number(currentVal) || 0;
  const prev = Number(prevVal) || 0;
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

function maskPhoneForRole(phone, userRole) {
  if (!phone) return '';
  if (userRole === 'admin') return phone;
  const str = String(phone);
  if (str.length <= 6) return '***';
  return `${str.slice(0, 3)}****${str.slice(-3)}`;
}

/**
 * 1. Dashboard KPIs Tool (Read-Only)
 */
async function getDashboardKpis({ period = 'this_month' } = {}, userContext = {}) {
  const prisma = getPrisma();
  const now = new Date();
  const range = resolveChatDateRange(period, now);

  const [products, salesInPeriod, prevSalesCount, periodAgg, prevAgg, setting] = await Promise.all([
    prisma.product.findMany(),
    prisma.sale.count({
      where: range.isAllTime ? {} : { createdAt: { gte: range.startCurrent, lte: range.endCurrent } },
    }),
    range.isAllTime
      ? Promise.resolve(0)
      : prisma.sale.count({
          where: { createdAt: { gte: range.startPrev, lte: range.endPrev } },
        }),
    prisma.sale.aggregate({
      where: range.isAllTime ? {} : { createdAt: { gte: range.startCurrent, lte: range.endCurrent } },
      _sum: { subtotal: true, discount: true, taxAmount: true, total: true, profit: true },
    }),
    range.isAllTime
      ? Promise.resolve({ _sum: { total: 0, profit: 0 } })
      : prisma.sale.aggregate({
          where: { createdAt: { gte: range.startPrev, lte: range.endPrev } },
          _sum: { total: true, profit: true },
        }),
    prisma.setting.findFirst({
      where: userContext?.id ? { userId: userContext.id } : undefined,
    }),
  ]);

  const lowStockProducts = products.filter(p => p.stock <= (p.lowStockThreshold ?? 5));
  const outOfStockProducts = products.filter(p => p.stock === 0);

  const totalRevenue = roundMoney(periodAgg._sum.total || 0);
  const totalProfit = roundMoney(periodAgg._sum.profit || 0);
  const totalTaxCollected = roundMoney(periodAgg._sum.taxAmount || 0);
  const prevRevenue = roundMoney(prevAgg._sum.total || 0);

  return {
    dataSource: 'postgresql',
    dataCategory: 'recorded_historical_and_current_inventory',
    periodKey: range.periodKey,
    periodLabel: range.label,
    timeWindowStart: range.isAllTime ? null : range.startCurrent.toISOString(),
    timeWindowEnd: range.endCurrent.toISOString(),
    currency: setting?.currency || '৳',
    totalProducts: products.length,
    totalSalesOrders: salesInPeriod,
    totalRevenue,
    totalProfit,
    totalTaxCollected,
    lowStockCount: lowStockProducts.length,
    outOfStockCount: outOfStockProducts.length,
    changesVsPriorPeriod: {
      salesPct: range.isAllTime ? 0 : computePctChange(salesInPeriod, prevSalesCount),
      revenuePct: range.isAllTime ? 0 : computePctChange(totalRevenue, prevRevenue),
    },
  };
}

/**
 * 2. Sales by Date Range Tool (Read-Only)
 */
async function getSalesByDateRange({ period = 'this_month', limit = 10 } = {}) {
  const prisma = getPrisma();
  const now = new Date();
  const range = resolveChatDateRange(period, now);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);

  const where = range.isAllTime
    ? {}
    : { createdAt: { gte: range.startCurrent, lte: range.endCurrent } };

  const [sales, count, agg, setting] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    }),
    prisma.sale.count({ where }),
    prisma.sale.aggregate({
      where,
      _sum: { subtotal: true, discount: true, taxAmount: true, total: true, profit: true },
    }),
    prisma.setting.findFirst(),
  ]);

  return {
    dataSource: 'postgresql',
    dataCategory: 'recorded_historical_sales',
    periodKey: range.periodKey,
    periodLabel: range.label,
    timeWindowStart: range.isAllTime ? null : range.startCurrent.toISOString(),
    timeWindowEnd: range.endCurrent.toISOString(),
    currency: setting?.currency || '৳',
    ordersCompleted: count,
    totalSubtotal: roundMoney(agg._sum.subtotal || 0),
    totalDiscount: roundMoney(agg._sum.discount || 0),
    totalTaxCollected: roundMoney(agg._sum.taxAmount || 0),
    totalRevenue: roundMoney(agg._sum.total || 0),
    totalProfit: roundMoney(agg._sum.profit || 0),
    recentInvoices: sales.map(s => ({
      invoiceNumber: s.invoiceNumber,
      customerName: s.customerName || 'Walk-in Customer',
      subtotal: s.subtotal,
      discount: s.discount,
      taxRate: s.taxRate,
      taxAmount: s.taxAmount,
      isLegacyTax: s.isLegacyTax,
      total: s.total,
      profit: s.profit,
      paymentMethod: s.paymentMethod,
      itemsCount: (s.items || []).reduce((sum, i) => sum + i.quantity, 0),
      itemsSummary: (s.items || []).map(i => `${i.name} x${i.quantity}`).join(', '),
      createdAt: s.createdAt,
    })),
  };
}

/**
 * 3. Revenue and Profit Breakdown Tool (Read-Only)
 */
async function getRevenueAndProfit({ period = 'this_month' } = {}) {
  const kpis = await getDashboardKpis({ period });
  return {
    dataSource: 'postgresql',
    dataCategory: 'recorded_historical_financials',
    periodKey: kpis.periodKey,
    periodLabel: kpis.periodLabel,
    timeWindowStart: kpis.timeWindowStart,
    timeWindowEnd: kpis.timeWindowEnd,
    currency: kpis.currency,
    ordersCompleted: kpis.totalSalesOrders,
    revenue: kpis.totalRevenue,
    profit: kpis.totalProfit,
    taxCollected: kpis.totalTaxCollected,
    revenueChangePctVsPrior: kpis.changesVsPriorPeriod.revenuePct,
    profitFormula: 'profit = (subtotal - discount) - totalCost (collected sales tax is excluded from profit)',
  };
}

/**
 * 4. Products and Inventory Search/Listing Tool (Read-Only)
 */
async function getProductsInventory({ search = '', category = '', status = '', limit = 20 } = {}) {
  const prisma = getPrisma();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const where = {};

  if (category && category !== 'All Categories') {
    where.category = { equals: String(category).trim(), mode: 'insensitive' };
  }
  if (search && String(search).trim()) {
    const q = String(search).trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
      { category: { contains: q, mode: 'insensitive' } },
    ];
  }

  const allMatching = await prisma.product.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  const filtered = status
    ? allMatching.filter(p => p.status.toLowerCase() === String(status).trim().toLowerCase())
    : allMatching;

  return {
    dataSource: 'postgresql',
    dataCategory: 'current_inventory',
    totalMatching: filtered.length,
    products: filtered.slice(0, safeLimit).map(p => ({
      name: p.name,
      sku: p.sku || null,
      category: p.category,
      price: p.price,
      cost: p.cost,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold ?? 5,
      status: p.status,
    })),
  };
}

/**
 * 5. Low-Stock and Out-of-Stock Items Tool (Read-Only)
 */
async function getLowAndOutOfStock() {
  const prisma = getPrisma();
  const products = await prisma.product.findMany({
    orderBy: [{ stock: 'asc' }, { name: 'asc' }],
  });

  const lowOrOut = products.filter(p => p.stock <= (p.lowStockThreshold ?? 5));
  const outOfStock = lowOrOut.filter(p => p.stock === 0);
  const runningLow = lowOrOut.filter(p => p.stock > 0);

  return {
    dataSource: 'postgresql',
    dataCategory: 'current_inventory_alerts',
    lowStockThresholdTotalCount: lowOrOut.length,
    outOfStockCount: outOfStock.length,
    runningLowInStockCount: runningLow.length,
    outOfStockProducts: outOfStock.map(p => ({
      name: p.name,
      sku: p.sku || null,
      category: p.category,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold ?? 5,
      status: 'Out of Stock',
    })),
    runningLowProducts: runningLow.map(p => ({
      name: p.name,
      sku: p.sku || null,
      category: p.category,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold ?? 5,
      status: 'Low Stock',
    })),
    allThresholdAlertProducts: lowOrOut.map(p => ({
      name: p.name,
      sku: p.sku || null,
      category: p.category,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold ?? 5,
      status: p.status,
    })),
  };
}

/**
 * 6. Top-Selling Products Tool (Read-Only)
 */
async function getTopSellingProducts({ limit = 5 } = {}) {
  const insights = await generateInsights();
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 10);

  return {
    dataSource: 'postgresql',
    dataCategory: 'recorded_historical_sales',
    periodKey: 'last_30_days',
    periodLabel: 'Last 30 Calendar Days',
    totalOrders30d: insights.totalOrders30d,
    totalUnitsSold30d: insights.totalUnitsSold30d,
    topProducts: (insights.topProducts || []).slice(0, safeLimit),
    slowMovingProducts: insights.slowMoving || [],
  };
}

/**
 * 7. Customer Purchase Summaries Tool (Read-Only)
 */
async function getCustomerSummaries({ limit = 10 } = {}, userContext = {}) {
  const prisma = getPrisma();
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);

  const [customers, saleStats] = await Promise.all([
    prisma.customer.findMany(),
    prisma.sale.groupBy({
      by: ['customerId'],
      where: { customerId: { not: null } },
      _count: { id: true },
      _sum: { total: true },
    }),
  ]);

  const statsByCustomerId = new Map(
    saleStats.map(row => [
      row.customerId,
      {
        orders: row._count.id || 0,
        spent: roundMoney(row._sum.total || 0),
      },
    ])
  );

  const enriched = customers
    .map(c => {
      const actual = statsByCustomerId.get(c.id) || { orders: 0, spent: 0 };
      return {
        name: c.name,
        phone: maskPhoneForRole(c.phone, userContext?.role),
        totalOrders: actual.orders,
        totalSpent: actual.spent,
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent || b.totalOrders - a.totalOrders);

  return {
    dataSource: 'postgresql',
    dataCategory: 'recorded_customer_summaries',
    totalCustomers: enriched.length,
    topCustomers: enriched.slice(0, safeLimit),
  };
}

/**
 * 8. Individual Customer Purchase History Tool (Read-Only)
 */
async function getCustomerPurchaseHistory({ customerQuery = '' } = {}, userContext = {}) {
  const prisma = getPrisma();
  const q = String(customerQuery || '').trim();
  if (!q) {
    return {
      found: false,
      message: 'Please provide a customer name or phone number to look up their purchase history.',
    };
  }

  const customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ],
    },
  });

  if (!customer) {
    return {
      found: false,
      message: `No customer matching "${q}" was found in PostgreSQL.`,
    };
  }

  const sales = await prisma.sale.findMany({
    where: { customerId: customer.id },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });

  const totalSpent = roundMoney(sales.reduce((s, inv) => s + (inv.total || 0), 0));

  return {
    found: true,
    dataSource: 'postgresql',
    dataCategory: 'recorded_customer_history',
    customer: {
      name: customer.name,
      phone: maskPhoneForRole(customer.phone, userContext?.role),
      totalOrders: sales.length,
      totalSpent,
    },
    invoices: sales.map(s => ({
      invoiceNumber: s.invoiceNumber,
      subtotal: s.subtotal,
      discount: s.discount,
      taxRate: s.taxRate,
      taxAmount: s.taxAmount,
      isLegacyTax: s.isLegacyTax,
      total: s.total,
      paymentMethod: s.paymentMethod,
      items: (s.items || []).map(i => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        subtotal: i.subtotal,
      })),
      createdAt: s.createdAt,
    })),
  };
}

/**
 * 9. Invoice Lookup Tool (Read-Only)
 */
async function getInvoiceDetails({ invoiceNumber = '' } = {}, userContext = {}) {
  const prisma = getPrisma();
  const raw = String(invoiceNumber || '').trim().toUpperCase();
  if (!raw) {
    return {
      found: false,
      message: 'Please specify an invoice number such as INV-1009.',
    };
  }

  const normalized = raw.startsWith('INV-') ? raw : `INV-${raw.replace(/^#/, '')}`;

  const sale = await prisma.sale.findFirst({
    where: {
      OR: [
        { invoiceNumber: { equals: normalized, mode: 'insensitive' } },
        { invoiceNumber: { equals: raw, mode: 'insensitive' } },
      ],
    },
    include: { items: true },
  });

  if (!sale) {
    return {
      found: false,
      dataSource: 'postgresql',
      queriedInvoiceNumber: normalized,
      message: `Invoice ${normalized} was not found in PostgreSQL.`,
    };
  }

  return {
    found: true,
    dataSource: 'postgresql',
    dataCategory: 'recorded_invoice_detail',
    invoice: {
      invoiceNumber: sale.invoiceNumber,
      customerName: sale.customerName || 'Walk-in Customer',
      customerPhone: maskPhoneForRole(sale.customerPhone, userContext?.role),
      paymentMethod: sale.paymentMethod,
      subtotal: sale.subtotal,
      discount: sale.discount,
      taxableAmount: sale.taxableAmount,
      taxRate: sale.taxRate,
      taxAmount: sale.taxAmount,
      isLegacyTax: sale.isLegacyTax,
      taxNote: sale.isLegacyTax
        ? 'Pre-migration legacy invoice (original tax rate snapshot was not recorded separately).'
        : `Persisted checkout tax snapshot (${sale.taxRate}%).`,
      total: sale.total,
      profit: sale.profit,
      createdAt: sale.createdAt,
      items: (sale.items || []).map(i => ({
        name: i.name,
        category: i.category,
        quantity: i.quantity,
        unitPrice: i.price,
        subtotal: i.subtotal,
      })),
    },
  };
}

/**
 * 10. Business Tax & Configuration Settings Tool (Read-Only)
 */
async function getBusinessTaxSettings(_args = {}, userContext = {}) {
  const prisma = getPrisma();
  const setting =
    (userContext?.id
      ? await prisma.setting.findFirst({ where: { userId: userContext.id } })
      : null) || (await prisma.setting.findFirst());

  return {
    dataSource: 'postgresql',
    dataCategory: 'business_configuration',
    businessName: setting?.businessName || 'StockWise AI',
    currency: setting?.currency || '৳',
    taxRatePct: setting?.taxRate ?? 0,
    lowStockThresholdDefault: setting?.lowStockThresholdDefault ?? 5,
    preferences: setting?.preferences || {
      lowStockAlerts: true,
      autoReorderSuggestions: true,
      emailReports: false,
    },
    taxCalculationFormula: {
      taxableAmount: 'max(0, subtotal - discount)',
      taxAmount: 'round(taxableAmount * taxRate / 100)',
      total: 'taxableAmount + taxAmount',
      profit: 'taxableAmount - totalCost (revenue excluding collected tax minus cost and discount)',
      persistenceNote:
        'Each sale stores a persistent snapshot of taxRate and taxAmount at checkout so future Business Settings changes never alter historical invoices.',
    },
  };
}

/**
 * 11. AI Demand Forecasts & Reorder Recommendations Tool (Read-Only)
 */
async function getAiForecastsAndReorders({ productName = '' } = {}) {
  // Fetch insights with forceRecommendations: true so we can explain forecast metrics even if preference is toggled off,
  // while also checking the live preference state.
  const [liveInsights, fullInsights] = await Promise.all([
    generateInsights(),
    generateInsights({ forceRecommendations: true }),
  ]);

  const query = String(productName || '').trim().toLowerCase();
  const allRecs = fullInsights.recommendations || [];
  const filteredRecs = query
    ? allRecs.filter(
        r =>
          r.product.toLowerCase().includes(query) ||
          (r.sku && r.sku.toLowerCase().includes(query))
      )
    : allRecs;

  return {
    dataSource: 'postgresql',
    dataCategory: 'forecast_and_recommendations_not_guaranteed',
    disclaimer:
      'Forecasts and stockout probabilities are statistical estimates from 30-day historical sales using Holt Double Exponential Smoothing and are not guaranteed outcomes.',
    autoReorderEnabled: liveInsights.autoReorderEnabled,
    recommendationState: liveInsights.recommendationState,
    disabledMessage: liveInsights.disabledMessage,
    lowStockThresholdAlertCount: liveInsights.thresholdAlertCount,
    proactiveForecastReorderCount: liveInsights.forecastReorderCount,
    enabledRecommendationCount: liveInsights.enabledRecommendationCount,
    recommendations: filteredRecs,
    slowMovingProducts: fullInsights.slowMoving || [],
    modelEvaluation: fullInsights.modelEvaluation,
  };
}

/**
 * 12. Application Help & Methodology Guide Tool (Read-Only)
 */
async function getAppHelpAndMethodology({ topic = 'general' } = {}) {
  return {
    dataSource: 'application_documentation',
    applicationName: 'StockWise AI',
    overview:
      'StockWise AI is a full-stack Smart Inventory, POS Checkout, Customer Management, and AI Demand Forecasting system built with React, Node.js/Express, PostgreSQL, and Prisma.',
    navigationStructure: {
      dashboard: '/dashboard — KPI cards, Sales Overview chart (This Year / Last 30 Days), date range filter, and Recent Sales.',
      products: '/products — Product catalog, unique SKU management, Low Stock tab, Stock History audit log, Categories valuation, and ±Stock adjustments.',
      salesAndCustomers:
        '/sales — Unified Sales & Customers page with three tabs: New Sale (/sales?tab=new), Sales History (/sales?tab=history), and Customers (/sales?tab=customers).',
      aiInsights:
        '/ai-insights — 14-day Holt demand forecasts, 7-day lead-time reorder points (ROP), calibrated stockout probabilities, and slow-moving inventory analysis.',
      settings:
        '/settings — Profile, Business configuration (currency, POS tax rate %, default low-stock threshold), Security password update, and Preferences.',
    },
    howToGuides: {
      createSale:
        'Go to Sales & Customers (/sales?tab=new). Search or click + on in-stock products to add them to the cart, optionally enter a discount, select a Payment Method (Cash, Card, bKash, Other), optionally select a customer (or leave as default Walk-in Customer), and click "Complete Sale". Stock is deducted atomically in PostgreSQL and an invoice (INV-XXXX) with a persistent tax snapshot is created.',
      addCustomer:
        'Go to Sales & Customers → Customers tab (/sales?tab=customers) and click "+ Add New Customer" (or click "+ Add New Customer" inside the Customer Information panel on the New Sale tab). Enter the customer name, phone number, and optional email/address, then click "Save Customer".',
      adjustStock:
        'Go to Products & Inventory (/products), click "±Stock" on a product row, enter a positive integer to restock or a negative integer to deduct stock, provide an audit reason, and click "Apply Adjustment".',
    },
    forecastingMethodology: {
      model: "Holt's Double (Linear) Exponential Smoothing with walk-forward hyperparameter grid search",
      window: '30 consecutive calendar days with explicit zero-filling for days without sales',
      horizon: '14-day demand forecast (forecast14dContinuous & rounded forecast14d) with 7-day replenishment lead time',
      sparseDemandHandling:
        'For products with ≤2 active sales days in the last 30 days, damped trend (phi=0.5) is blended with the empirical 30-day daily rate so single-day spikes do not extrapolate into unrealistic 14-day forecasts.',
      reorderPointAndSafetyStock:
        'Safety Stock SS = max(ceil(1.645 * sigma_7d), lowStockThreshold) for a 95% service level; Reorder Point ROP = LeadTimeDemand_7d + SS.',
      stockoutProbability:
        'Calibrated Gaussian CDF P(Demand_14d > CurrentStock) = Phi((mu_14 - stock) / sigma_14) with a Poisson variance floor. Parity (stock == forecast14d) yields 50% Moderate risk; zero 30-day sales with positive stock yields ≤15% risk.',
      thresholdVsForecastDifference:
        'Low-Stock Threshold Alerts trigger when current stock is at or below the static per-product threshold (stock <= lowStockThreshold), regardless of sales velocity. Proactive Forecast Reorder Suggestions trigger when a product is above its static threshold but its 14-day demand forecast / 7-day Reorder Point (ROP) indicates upcoming depletion.',
    },
    requestedTopic: topic,
  };
}

/**
 * OpenAI-compatible function tool declarations for the LLM provider.
 */
const CHAT_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_dashboard_kpis',
      description:
        'Get live Dashboard KPIs from PostgreSQL (total products, sales count, revenue, profit, collected tax, low-stock count, out-of-stock count, and period-over-period % changes).',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'last_7_days', 'last_30_days', 'this_month', 'all_time'],
            description: 'Time period for sales, revenue, and profit.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sales_by_date_range',
      description:
        'Get recorded sales count, subtotal, discounts, tax collected, total revenue, profit, and recent invoices for a specific period (today, last_7_days / this_week, last_30_days, this_month, all_time).',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'last_7_days', 'last_30_days', 'this_month', 'all_time'],
          },
          limit: {
            type: 'number',
            description: 'Max recent invoices to include (1-25).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_revenue_and_profit',
      description:
        'Get recorded revenue, net profit, collected tax, and order count for a requested period (today, last_7_days, last_30_days, this_month, all_time).',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'last_7_days', 'last_30_days', 'this_month', 'all_time'],
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_products_inventory',
      description:
        'Search or list products in inventory with SKU, category, price, cost, stock quantity, low-stock threshold, and stock status.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Optional product name or SKU search term.' },
          category: { type: 'string', description: 'Optional category filter.' },
          status: {
            type: 'string',
            enum: ['', 'In Stock', 'Low Stock', 'Out of Stock'],
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_low_and_out_of_stock',
      description:
        'Get all products that are currently out of stock (0 units) or running low (at or below their low-stock threshold).',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_selling_products',
      description:
        'Get the top-selling products by units sold and revenue over the last 30 calendar days, as well as slow-moving products.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_summaries',
      description:
        'Get top customers ranked by total spending and completed order counts.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_purchase_history',
      description:
        'Look up a specific customer by name or phone number and retrieve their reconciled order count, total spending, and invoice history.',
      parameters: {
        type: 'object',
        properties: {
          customerQuery: { type: 'string', description: 'Customer name or phone number.' },
        },
        required: ['customerQuery'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_invoice_details',
      description:
        'Look up a specific sale invoice by invoice number (e.g., INV-1009, INV-1012) and return its line items, subtotal, discount, tax snapshot, total, and profit.',
      parameters: {
        type: 'object',
        properties: {
          invoiceNumber: { type: 'string', description: 'Invoice number such as INV-1009.' },
        },
        required: ['invoiceNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_business_tax_settings',
      description:
        'Get current Business Settings (business name, currency, POS tax rate %, default low-stock threshold, preferences) and how sales tax is calculated and persisted on invoices.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ai_forecasts_and_reorders',
      description:
        'Get 14-day Holt demand forecasts, 7-day lead-time reorder points (ROP), safety stock, calibrated stockout risk probabilities, reorder recommendations, and walk-forward model evaluation metrics.',
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description: 'Optional product name or SKU to filter forecast/risk details.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_app_help_and_methodology',
      description:
        'Get instructions on how to use StockWise AI (creating a sale, adding a customer, adjusting stock) and explanations of Holt Double Exponential Smoothing, threshold alerts vs forecast reorders, and tax calculation.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
        },
      },
    },
  },
];

const CHAT_TOOLS_EXECUTOR = {
  get_dashboard_kpis: getDashboardKpis,
  get_sales_by_date_range: getSalesByDateRange,
  get_revenue_and_profit: getRevenueAndProfit,
  get_products_inventory: getProductsInventory,
  get_low_and_out_of_stock: getLowAndOutOfStock,
  get_top_selling_products: getTopSellingProducts,
  get_customer_summaries: getCustomerSummaries,
  get_customer_purchase_history: getCustomerPurchaseHistory,
  get_invoice_details: getInvoiceDetails,
  get_business_tax_settings: getBusinessTaxSettings,
  get_ai_forecasts_and_reorders: getAiForecastsAndReorders,
  get_app_help_and_methodology: getAppHelpAndMethodology,
};

/**
 * Executes an approved read-only tool by name.
 * Rejects any unknown/unapproved tool name to prevent prompt-injection privilege escalation.
 */
async function executeApprovedChatTool(toolName, rawArgs = {}, userContext = {}) {
  const fn = CHAT_TOOLS_EXECUTOR[toolName];
  if (typeof fn !== 'function') {
    throw new Error(`Unauthorized or unknown tool requested: ${toolName}`);
  }
  const safeArgs = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  return fn(safeArgs, userContext);
}

module.exports = {
  CHAT_TOOL_DEFINITIONS,
  CHAT_TOOLS_EXECUTOR,
  executeApprovedChatTool,
  resolveChatDateRange,
};
