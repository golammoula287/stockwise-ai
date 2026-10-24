// Derive the chart from daily totals without changing the monthly accounting figures.
export function prepareRevenueChart(points = []) {
  const cents = value => Math.round((Number(value) || 0) * 100);
  let currentTotal = 0, previousTotal = 0;
  const cumulative = points.map(point => {
    if (point.current != null) currentTotal += cents(point.current);
    if (point.previous != null) previousTotal += cents(point.previous);
    return { ...point, current: point.current == null ? null : currentTotal / 100, previous: point.previous == null ? null : previousTotal / 100 };
  });
  const comparable = points.filter(point => point.current != null && point.previous != null);
  const selected = comparable.reduce((sum, point) => sum + cents(point.current), 0) / 100;
  const previous = comparable.reduce((sum, point) => sum + cents(point.previous), 0) / 100;
  const difference = Math.round((selected - previous) * 100) / 100;
  return { cumulative, daily: points, selected, previous, difference, change: previous ? Math.round(difference / previous * 100) : null, throughDay: comparable.at(-1)?.day || 0, hasRevenue: points.some(point => point.current > 0 || point.previous > 0) };
}
