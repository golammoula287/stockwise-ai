const { PrismaClient } = require('@prisma/client');
const { roundMoney } = require('../utils/formatters');

let prismaInstance = null;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidId(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

function computeProductStatus(product) {
  const stock = Number(product.stock ?? 0);
  const threshold = Number(product.lowStockThreshold ?? 5);
  if (stock <= 0) return 'Out of Stock';
  if (stock <= threshold) return 'Low Stock';
  return 'In Stock';
}

function resolveDatabaseUrl(explicitUri) {
  if (explicitUri) return explicitUri;
  if (process.env.NODE_ENV === 'test') {
    return (
      process.env.TEST_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/stockwise_test?schema=public'
    );
  }
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL environment variable is required in production');
  }
  return 'postgresql://postgres:postgres@localhost:5432/stockwise?schema=public';
}

function createPrismaClient(datasourceUrl) {
  const base = new PrismaClient({
    datasources: datasourceUrl ? { db: { url: datasourceUrl } } : undefined,
    log: process.env.PRISMA_LOG === 'true' ? ['query', 'error', 'warn'] : ['error'],
  });

  return base.$extends({
    result: {
      user: {
        _id: {
          needs: { id: true },
          compute(user) {
            return user.id;
          },
        },
      },
      product: {
        _id: {
          needs: { id: true },
          compute(product) {
            return product.id;
          },
        },
        status: {
          needs: { stock: true, lowStockThreshold: true },
          compute(product) {
            return computeProductStatus(product);
          },
        },
      },
      customer: {
        _id: {
          needs: { id: true },
          compute(customer) {
            return customer.id;
          },
        },
        totalPurchases: {
          needs: { totalOrders: true },
          compute(customer) {
            return customer.totalOrders;
          },
        },
      },
      sale: {
        _id: {
          needs: { id: true },
          compute(sale) {
            return sale.id;
          },
        },
        tax: {
          needs: { taxAmount: true },
          compute(sale) {
            return sale.taxAmount ?? null;
          },
        },
        taxableAmount: {
          needs: { subtotal: true, discount: true },
          compute(sale) {
            return roundMoney(Math.max(0, (Number(sale.subtotal) || 0) - (Number(sale.discount) || 0)));
          },
        },
        isLegacyTax: {
          needs: { taxRate: true, taxAmount: true },
          compute(sale) {
            return sale.taxRate === null || sale.taxRate === undefined || sale.taxAmount === null || sale.taxAmount === undefined;
          },
        },
      },
      saleItem: {
        _id: {
          needs: { id: true },
          compute(item) {
            return item.id;
          },
        },
        product: {
          needs: { productId: true },
          compute(item) {
            return item.productId;
          },
        },
        productName: {
          needs: { name: true },
          compute(item) {
            return item.name;
          },
        },
        unitPrice: {
          needs: { price: true },
          compute(item) {
            return item.price;
          },
        },
        costPrice: {
          needs: { cost: true },
          compute(item) {
            return item.cost;
          },
        },
      },
      stockLog: {
        _id: {
          needs: { id: true },
          compute(log) {
            return log.id;
          },
        },
        product: {
          needs: { productId: true },
          compute(log) {
            return log.productId;
          },
        },
      },
      setting: {
        _id: {
          needs: { id: true },
          compute(setting) {
            return setting.id;
          },
        },
      },
    },
  });
}

function getPrisma() {
  if (!prismaInstance) {
    const url = resolveDatabaseUrl();
    prismaInstance = createPrismaClient(url);
  }
  return prismaInstance;
}

async function connectDB(uri) {
  const url = resolveDatabaseUrl(uri);
  if (!prismaInstance) {
    prismaInstance = createPrismaClient(url);
  }
  await prismaInstance.$connect();
  return prismaInstance;
}

async function disconnectDB() {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.disconnectDB = disconnectDB;
module.exports.getPrisma = getPrisma;
module.exports.isValidId = isValidId;
module.exports.computeProductStatus = computeProductStatus;
