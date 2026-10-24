// Bangladesh calendar dates: inclusive start, exclusive midnight after the end date.
export function salesPeriod(query = {}) {
  const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
  const date = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0,4) < '2000' || value.slice(0,4) > '2100') invalid('Choose a valid date (2000–2100).');
    const stamp = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10) !== value) invalid('Choose a valid calendar date.');
    return stamp - 6 * 3600000;
  };
  if (query.month) {
    if (query.startDate || query.endDate) invalid('Choose a month or a date range.');
    if (typeof query.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)) invalid('Choose a valid month.');
    const start = date(`${query.month}-01`);
    const [year, month] = query.month.split('-').map(Number);
    return { start, end: Date.UTC(year,month,1)-6*3600000, label: query.month };
  }
  if (query.startDate || query.endDate) {
    if (!query.startDate || !query.endDate) invalid('Choose both start and end dates.');
    const start = date(query.startDate), end = date(query.endDate) + 86400000;
    if (start >= end) invalid('End date must be on or after start date.');
    return { start, end, label: `${query.startDate}_to_${query.endDate}` };
  }
  return { label: 'all-time' };
}
export async function fetchSalesReport(get, params) {
  const rows = [];
  for (let page = 1; ; page++) {
    const { data } = await get('/sales', { params: { ...params, limit: 200, page } });
    rows.push(...data.sales);
    if (page >= data.pages) return rows;
  }
}
