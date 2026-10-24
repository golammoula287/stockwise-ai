import { useId, useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { formatCurrency } from '../lib/formatters';
import { prepareRevenueChart } from '../lib/revenueChart';
const compact = value => Math.abs(value) >= 1000000 ? `${Number((value / 1000000).toFixed(1))}m` : Math.abs(value) >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : value;
function RevenueTooltip({ active, payload, labels, currency, mode }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const difference = point.current != null && point.previous != null ? Math.round((point.current - point.previous) * 100) / 100 : null;
  return <div className="revenue-tooltip"><p>Day {point.day} <span>{mode === 'cumulative' ? 'Running total' : 'Daily revenue'}</span></p><dl><div><dt><i />{labels.current}</dt><dd>{point.current == null ? 'Not available' : formatCurrency(point.current, currency)}</dd></div><div><dt><i />{labels.previous}</dt><dd>{point.previous == null ? 'Not available' : formatCurrency(point.previous, currency)}</dd></div></dl>{difference != null && <footer>Difference <strong>{difference > 0 ? '+' : ''}{formatCurrency(difference, currency)}</strong></footer>}</div>;
}
export default function RevenueComparison({ data, currency, labels }) {
  const [mode, setMode] = useState('cumulative');
  const view = useMemo(() => prepareRevenueChart(data), [data]);
  const gradient = `revenue-${useId().replaceAll(':', '')}`;
  const maxDay = Math.max(1, ...data.map(point => point.day));
  const ticks = [1, 5, 10, 15, 20, 25, maxDay].filter((day, index, list) => day <= maxDay && list.indexOf(day) === index);
  return <div className="revenue-comparison"><div className="revenue-chart-toolbar"><div><h2>Revenue trend</h2><p>Compare sales progress, day by day.</p></div><div className="revenue-view-switch" role="group" aria-label="Revenue chart view">{[{ value: 'cumulative', label: 'Cumulative' }, { value: 'daily', label: 'Daily' }].map(option => <button type="button" key={option.value} aria-pressed={mode === option.value} onClick={() => setMode(option.value)}>{option.label}</button>)}</div></div>
    <div className="revenue-chart-summary"><div><span>{labels.current}</span><strong>{formatCurrency(view.selected, currency)}</strong></div><div><span>{labels.previous}</span><strong>{formatCurrency(view.previous, currency)}</strong></div><div><span>Same-day difference</span><strong className={view.difference < 0 ? 'revenue-negative' : view.difference > 0 ? 'revenue-positive' : ''}>{view.change == null ? 'No baseline' : `${view.change > 0 ? '+' : ''}${view.change}%`}</strong></div></div>
    <div className="revenue-comparison-meta"><span>{view.throughDay ? `Figures compare days 1–${view.throughDay} in both months` : 'No comparable dates'}</span><div className="revenue-legend"><span><i />Selected month</span><span><i />Previous month</span></div></div>
    {view.hasRevenue ? <div className="revenue-comparison-plot" role="img" aria-label={`${mode === 'cumulative' ? 'Cumulative' : 'Daily'} revenue for ${labels.current} compared with ${labels.previous}`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={mode === 'cumulative' ? view.cumulative : view.daily} margin={{ top: 16, right: 12, left: 0, bottom: 8 }} barGap={2}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7692ff" stopOpacity={.2} /><stop offset="100%" stopColor="#7692ff" stopOpacity={.01} /></linearGradient></defs>
      <CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="3 5" /><XAxis dataKey="day" ticks={ticks} tick={{ fontSize: 10, fill: '#8490a4' }} axisLine={false} tickLine={false} minTickGap={16} tickMargin={10} /><YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: '#8490a4' }} axisLine={false} tickLine={false} width={44} tickMargin={8} domain={[0, 'auto']} /><Tooltip content={<RevenueTooltip labels={labels} currency={currency} mode={mode} />} cursor={mode === 'daily' ? { fill: '#f4f6fc' } : { stroke: '#c6d1e8', strokeDasharray: '3 3' }} />
      {mode === 'cumulative' ? <><Line type="linear" dataKey="previous" stroke="#a4b1ce" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} /><Area type="linear" dataKey="current" stroke="#1b2cc1" fill={`url(#${gradient})`} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#1b2cc1', stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} /></> : <><Bar dataKey="previous" fill="#d3dced" maxBarSize={10} radius={[3, 3, 0, 0]} isAnimationActive={false} /><Bar dataKey="current" fill="#1b2cc1" maxBarSize={10} radius={[3, 3, 0, 0]} isAnimationActive={false} /></>}
    </ComposedChart></ResponsiveContainer></div> : <div className="revenue-comparison-plot dashboard-empty">No revenue recorded in either month.</div>}
    <p className="dashboard-footnote">{mode === 'cumulative' ? 'Cumulative shows how revenue builds through each month.' : 'Daily shows the revenue recorded on each day.'} Future dates and missing calendar days stay blank. Dates use Bangladesh time.</p>
  </div>;
}
