/**
 * Reusable frontend quantity, unit/item pluralization, currency, and date formatters (IMP-15).
 */

export function pluralize(count, singular, plural = `${singular}s`) {
  const num = Number(count);
  return Math.abs(num) === 1 ? singular : plural;
}

export function formatCount(count, singular, plural = `${singular}s`, prefix = '') {
  const num = Number.isFinite(Number(count)) ? Number(count) : 0;
  return `${prefix}${num} ${pluralize(num, singular, plural)}`;
}

export function formatUnits(count, prefix = '') {
  return formatCount(count, 'unit', 'units', prefix);
}

export function formatItems(count, prefix = '') {
  return formatCount(count, 'item', 'items', prefix);
}

export function formatSignedUnits(delta) {
  const num = Number(delta) || 0;
  const sign = num > 0 ? '+' : '';
  return `${sign}${num} ${pluralize(num, 'unit', 'units')}`;
}

export function formatCurrency(amount, currency = '৳') {
  const num = Number(amount);
  const safe = Number.isFinite(num) ? Math.round((num + Number.EPSILON) * 100) / 100 : 0;
  return `${currency} ${safe.toLocaleString('en-BD', {
    minimumFractionDigits: Number.isInteger(safe) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTimeBD(dateInput, includeTime = true) {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '—';
  const options = includeTime
    ? {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }
    : {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      };
  return d.toLocaleDateString('en-US', options);
}
