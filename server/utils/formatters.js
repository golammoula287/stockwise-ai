/**
 * Quantity, singular/plural unit, and monetary formatting utilities (IMP-15 & IMP-16).
 */

function pluralize(count, singular, plural = `${singular}s`) {
  const num = Number(count);
  return Math.abs(num) === 1 ? singular : plural;
}

function formatCount(count, singular, plural = `${singular}s`, prefix = '') {
  const num = Number.isFinite(Number(count)) ? Number(count) : 0;
  return `${prefix}${num} ${pluralize(num, singular, plural)}`;
}

function formatUnits(count, prefix = '') {
  return formatCount(count, 'unit', 'units', prefix);
}

function formatItems(count, prefix = '') {
  return formatCount(count, 'item', 'items', prefix);
}

function formatSignedUnits(delta) {
  const num = Number(delta) || 0;
  const sign = num > 0 ? '+' : '';
  return `${sign}${num} ${pluralize(num, 'unit', 'units')}`;
}

/**
 * Minor-unit (paisa / cents) integer rounding to eliminate IEEE-754 floating-point drift (IMP-16).
 */
function toMinorUnits(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100);
}

function fromMinorUnits(minorUnits) {
  return Math.round(Number(minorUnits) || 0) / 100;
}

function roundMoney(amount) {
  return fromMinorUnits(toMinorUnits(amount));
}

/**
 * Deterministic server-side invoice tax & total calculation using integer minor units (IMP-16).
 *
 * Formulas:
 *   taxableAmount = max(0, subtotal - discount)
 *   taxAmount     = round(taxableAmount * taxRate / 100)
 *   total         = taxableAmount + taxAmount
 *   profit        = taxableAmount - totalCost (revenue excluding collected tax minus cost & discount)
 */
function calculateInvoiceFinancials({
  subtotal = 0,
  discount = 0,
  totalCost = 0,
  taxRate = 0,
  explicitTaxAmount,
}) {
  const subtotalMinor = Math.max(0, toMinorUnits(subtotal));
  const discountMinor = Math.max(0, toMinorUnits(discount));
  const costMinor = Math.max(0, toMinorUnits(totalCost));
  const rate = Math.max(0, Number(taxRate) || 0);

  const taxableMinor = Math.max(0, subtotalMinor - discountMinor);
  const taxAmountMinor =
    explicitTaxAmount !== undefined && explicitTaxAmount !== null
      ? Math.max(0, toMinorUnits(explicitTaxAmount))
      : Math.round((taxableMinor * rate) / 100);

  const totalMinor = taxableMinor + taxAmountMinor;
  const profitMinor = taxableMinor - costMinor;

  return {
    subtotal: fromMinorUnits(subtotalMinor),
    discount: fromMinorUnits(discountMinor),
    taxableAmount: fromMinorUnits(taxableMinor),
    taxRate: roundMoney(rate),
    taxAmount: fromMinorUnits(taxAmountMinor),
    total: fromMinorUnits(totalMinor),
    totalCost: fromMinorUnits(costMinor),
    profit: fromMinorUnits(profitMinor),
  };
}

module.exports = {
  pluralize,
  formatCount,
  formatUnits,
  formatItems,
  formatSignedUnits,
  toMinorUnits,
  fromMinorUnits,
  roundMoney,
  calculateInvoiceFinancials,
};
