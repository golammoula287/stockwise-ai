const { AsyncLocalStorage } = require('node:async_hooks');

// Set only from the database-authenticated user, never from a request body or JWT role.
const workspaceContext = new AsyncLocalStorage();
const ownedModels = new Set(['Product', 'Customer', 'Sale', 'StockLog', 'Category']);
const readsAndWrites = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany']);

function workspaceOwnerId(user) {
  return user.privateWorkspace === true ? (user.adminId || user.id) : null;
}

function scopeArgs(model, operation, args, user) {
  if (!user || (!ownedModels.has(model) && model !== 'SaleItem' && model !== 'Setting')) return args;
  const field = model === 'Setting' ? 'userId' : 'workspaceOwnerId';
  const value = model === 'Setting' ? (user.adminId || user.id) : workspaceOwnerId(user);
  const scope = model === 'SaleItem' ? { sale: { workspaceOwnerId: value } } : { [field]: value };
  if (readsAndWrites.has(operation)) {
    const scoped = { ...args, where: { ...args?.where, ...scope } };
    if (args?.data && (operation === 'update' || operation === 'updateMany') && model !== 'SaleItem') {
      scoped.data = { ...args.data, [field]: value };
    }
    return scoped;
  }
  if (model !== 'SaleItem' && (operation === 'create' || operation === 'createMany')) {
    const stamp = data => ({ ...data, [field]: value });
    return { ...args, data: Array.isArray(args.data) ? args.data.map(stamp) : stamp(args.data) };
  }
  // New operations must be reviewed for ownership before use in authenticated requests.
  throw new Error(`Unsupported workspace operation: ${model}.${operation}`);
}

function workspaceQuery({ model, operation, args, query }) {
  return query(scopeArgs(model, operation, args, workspaceContext.getStore()));
}

module.exports = { workspaceContext, workspaceOwnerId, scopeArgs, workspaceQuery };
