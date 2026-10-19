import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatCount, formatCurrency } from '../lib/formatters';

const SalesOverviewChart = lazy(() => import('../components/SalesOverviewChart.jsx'));

function StatCard({ icon, iconBg, title, value, sub, subColor }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-start gap-3.5">
      <div className={`w-10 h-10 rounded-xl grid place-items-center text-base font-bold shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500 font-medium">{title}</div>
        <div className="text-2xl font-extrabold text-slate-900 mt-0.5">{value}</div>
        <div className={`text-xs font-medium mt-1 ${subColor}`}>{sub}</div>
      </div>
    </div>
  );
}

function formatPct(pct, suffix = 'vs prior period') {
  const n = Number(pct) || 0;
  if (n > 0) return `+${n}% ${suffix}`;
  if (n < 0) return `${n}% ${suffix}`;
  return `0% ${suffix}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [chart, setChart] = useState([]);
  const [range, setRange] = useState('This Year');
  const [dateFilter, setDateFilter] = useState('This Month');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, r, c] = await Promise.all([
          api.get('/dashboard/stats', { params: { dateFilter } }),
          api.get('/dashboard/recent-sales', { params: { limit: 5, dateFilter } }),
          api.get('/dashboard/sales-overview', { params: { range } }),
        ]);
        if (!active) return;
        setStats(s.data);
        setRecent(r.data);
        setChart(c.data);
      } catch (e) {
        if (active) setErr(e.response?.data?.message || 'Failed to load dashboard');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [range, dateFilter]);

  if (loading) {
    return (
      <div className="bg-white border rounded-2xl p-10 text-center text-slate-500 text-sm">
        Loading dashboard analytics...
      </div>
    );
  }
  if (err) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">
        {err}
      </div>
    );
  }

  const firstName = (user?.name || 'John').split(' ')[0];
  const currency = stats?.currency || '৳';

  return (
    <div className="space-y-6">
      {/* Greeting & Date Filter */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Good Morning, {firstName}!</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Live business metrics for <strong>{stats?.dateFilter || dateFilter}</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-600 shadow-sm">
          <span>📅</span>
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="bg-transparent outline-none font-medium cursor-pointer"
            aria-label="Date range"
          >
            <option value="This Month">This Month</option>
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="Last 7 Days">Last 7 Days</option>
            <option value="Today">Today</option>
            <option value="All Time">All Time</option>
          </select>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon="📦"
          iconBg="bg-emerald-100 text-emerald-700"
          title="Total Products"
          value={stats.totalProducts}
          sub={formatPct(stats.changes?.products, 'from last month')}
          subColor={(stats.changes?.products || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}
        />
        <StatCard
          icon="🛒"
          iconBg="bg-blue-100 text-blue-700"
          title={`Sales (${stats.dateFilter || dateFilter})`}
          value={stats.totalSales}
          sub={formatPct(stats.changes?.sales, 'vs prior period')}
          subColor={(stats.changes?.sales || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}
        />
        <StatCard
          icon={currency}
          iconBg="bg-amber-100 text-amber-700"
          title={`Revenue (${stats.dateFilter || dateFilter})`}
          value={formatCurrency(stats.totalRevenue || 0, currency)}
          sub={`${formatPct(stats.changes?.revenue, 'vs prior')} · Profit: ${formatCurrency(stats.totalProfit || 0, currency)}`}
          subColor={(stats.changes?.revenue || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}
        />
        <StatCard
          icon="⚠"
          iconBg="bg-red-100 text-red-600"
          title="Low Stock Items"
          value={stats.lowStockCount}
          sub={
            stats.lowStockCount > 0
              ? `${formatCount(stats.outOfStockCount || 0, 'item')} out of stock · At/below threshold`
              : 'All products above threshold'
          }
          subColor={stats.lowStockCount > 0 ? 'text-red-600' : 'text-emerald-600'}
        />
      </div>

      {/* Charts & Recent Sales */}
      <div className="grid lg:grid-cols-12 gap-5">
        {/* Sales Overview Chart */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-slate-900 text-base">Sales Overview</h2>
              <p className="text-[11px] text-slate-400">Actual revenue recorded in PostgreSQL</p>
            </div>
            <select
              value={range}
              onChange={e => setRange(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 font-medium outline-none"
              aria-label="Chart range"
            >
              <option value="This Year">This Year (Monthly)</option>
              <option value="This Month">Last 30 Days (3-Day Intervals)</option>
            </select>
          </div>
          <Suspense
            fallback={
              <div className="h-[250px] grid place-items-center text-xs text-slate-400">
                Loading revenue chart...
              </div>
            }
          >
            <SalesOverviewChart chart={chart} currency={currency} />
          </Suspense>
        </div>

        {/* Recent Sales Table */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900 text-base">Recent Sales</h2>
            <Link to="/sales" className="text-blue-600 hover:underline text-xs font-semibold">
              View All
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100">
                  <th className="text-left py-2 font-medium">Invoice</th>
                  <th className="text-left py-2 font-medium">Customer</th>
                  <th className="text-left py-2 font-medium">Amount</th>
                  <th className="text-right py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-slate-50/80">
                    <td className="py-3 font-semibold text-blue-600">{r.invoiceNumber || `#${i + 1}`}</td>
                    <td className="py-3 font-medium text-slate-800">{r.customer}</td>
                    <td className="py-3 font-semibold text-slate-900">
                      {formatCurrency(r.amount, currency)}
                    </td>
                    <td className="py-3 text-right text-slate-500">
                      {new Date(r.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recent.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-400">
                No sales recorded in the selected date range.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
