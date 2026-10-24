import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export default function SalesOverviewChart({ chart = [], currency = '৳' }) {
  return (
    <div className="h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chart}>
          <defs>
            <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1b2cc1" stopOpacity={0.22} />
              <stop offset="95%" stopColor="#1b2cc1" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#56657a' }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: '#56657a' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}K` : v)}
          />
          <Tooltip formatter={v => [`${currency} ${Number(v).toLocaleString()}`, 'Sales']} />
          <Area
            type="monotone"
            dataKey="sales"
            stroke="#1b2cc1"
            strokeWidth={2.5}
            fill="url(#salesArea)"
            dot={{ r: 3, fill: '#1b2cc1' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
