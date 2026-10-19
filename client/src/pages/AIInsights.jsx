import { useEffect, useState } from 'react';
import api from '../lib/api';

export default function AIInsights() {
  const [tab, setTab] = useState('Overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restockingId, setRestockingId] = useState(null);
  const [err, setErr] = useState('');
  const [restockMsg, setRestockMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/ai/insights');
      setData(res.data);
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to load AI insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const quickRestock = async (rec) => {
    if (restockingId) return;
    // Always clear previous success message before attempting restock (fixes IMP-12)
    setRestockMsg('');
    setErr('');
    setRestockingId(rec.productId);
    try {
      await api.patch(`/products/${rec.productId}/stock`, {
        delta: rec.suggested,
        note: `AI recommended restock (+${rec.suggested} units)`,
      });
      setRestockMsg(`Restocked "${rec.product}" by +${rec.suggested} units.`);
      load();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to restock product');
    } finally {
      setRestockingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border rounded-2xl p-10 text-center text-slate-500 text-sm">
        Running Holt time-series demand forecasting &amp; stockout risk model...
      </div>
    );
  }
  if (err && !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">
        {err}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-extrabold text-xl text-slate-900">AI Insights</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Calibrated 14-day Holt demand forecasting, lead-time reorder points, and stockout risk analysis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
            Low-Stock Threshold Alerts: {data.lowStockCount ?? 0}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 font-semibold">
            Proactive Forecast Reorders: {data.forecastReorderCount ?? 0}
          </span>
        </div>
      </div>

      {/* Underline Tabs */}
      <div className="bg-white border border-slate-200/80 rounded-2xl px-5 pt-3 shadow-sm">
        <div className="flex gap-6 text-xs font-semibold">
          {['Overview', 'Recommendations', 'Demand Analysis'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 border-b-2 transition ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {restockMsg && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-2.5 rounded-xl flex justify-between"
        >
          <span>✓ {restockMsg}</span>
          <button onClick={() => setRestockMsg('')} aria-label="Dismiss message">
            ✕
          </button>
        </div>
      )}
      {err && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2.5 rounded-xl flex justify-between"
        >
          <span>⚠ {err}</span>
          <button onClick={() => setErr('')} aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}

      {/* AI Business Summary Banner */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50/60 to-emerald-50 border border-blue-200/70 rounded-2xl p-5 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-white border border-blue-100 shadow-sm grid place-items-center text-blue-600 font-bold text-lg shrink-0">
            📈
          </div>
          <div>
            <div className="text-xs font-extrabold text-blue-700">AI Business Summary</div>
            <p className="text-sm text-slate-800 font-medium mt-1 leading-relaxed">{data.summary}</p>
            <div className="text-[11px] text-slate-500 mt-1">
              Note: Dashboard &ldquo;Low Stock Items&rdquo; ({data.lowStockCount}) counts items at or below their static threshold, while AI Insights ({data.recommendations.length}) combines threshold alerts ({data.thresholdAlertCount ?? data.lowStockCount}) with proactive 14-day demand forecast reorders ({data.forecastReorderCount ?? 0}).
            </div>
          </div>
        </div>
        <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-white/90 border border-blue-100 shadow-sm items-center justify-center text-3xl shrink-0">
          🤖
        </div>
      </div>

      {/* Overview & Recommendations */}
      {(tab === 'Overview' || tab === 'Recommendations') && (
        <div className="grid lg:grid-cols-12 gap-5">
          {/* Left: Stock Recommendations */}
          <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-sm text-slate-900">
                Stock Recommendations ({data.recommendations.length})
              </h2>
              <button
                onClick={() => setTab('Recommendations')}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                View All
              </button>
            </div>

            <div className="space-y-3">
              {data.recommendations.map(rec => (
                <div
                  key={rec.productId || rec.product}
                  className="flex flex-wrap items-center justify-between gap-3 border border-slate-100 hover:border-slate-200 rounded-xl p-3.5"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-[240px]">
                    <span className="w-10 h-10 bg-slate-100 rounded-xl grid place-items-center text-base shrink-0">
                      {rec.product.toLowerCase().includes('keyboard')
                        ? '⌨'
                        : rec.product.toLowerCase().includes('bag')
                        ? '🎒'
                        : '🖱'}
                    </span>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{rec.product}</span>
                        {rec.sku && (
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            {rec.sku}
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            rec.triggerType === 'threshold'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          {rec.triggerLabel || (rec.triggerType === 'threshold' ? 'Threshold Alert' : 'Forecast Reorder')}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>
                          Stock: <strong className="text-slate-800">{rec.stock}</strong> (Threshold: {rec.lowStockThreshold})
                        </span>
                        <span>
                          14d Forecast: <strong className="text-slate-800">{rec.forecast14d} units</strong> ({rec.forecast14dContinuous ?? rec.forecast14d})
                        </span>
                        <span>
                          Safety Stock: <strong>{rec.safetyStock}</strong> · ROP: <strong>{rec.reorderPoint ?? rec.safetyStock}</strong>
                        </span>
                        <span>
                          14d Stockout Risk: <strong className={rec.stockoutProbability >= 70 ? 'text-red-600' : 'text-slate-800'}>{rec.stockoutProbability}%</strong>
                        </span>
                      </div>

                      <div className="text-[11px] text-blue-700 font-semibold">
                        Recommended Order: +{rec.suggested} units (Est. cost: ৳ {Number(rec.estimatedCost || 0).toLocaleString()})
                      </div>

                      {rec.explainability && (
                        <div className="text-[10px] text-slate-400">{rec.explainability}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                        rec.priority === 'High'
                          ? 'bg-red-50 text-red-600 border border-red-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {rec.priority} Priority
                    </span>
                    <button
                      onClick={() => quickRestock(rec)}
                      disabled={restockingId === rec.productId}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-semibold disabled:opacity-50"
                    >
                      {restockingId === rec.productId ? 'Restocking...' : `Restock +${rec.suggested}`}
                    </button>
                  </div>
                </div>
              ))}
              {data.recommendations.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">
                  {data.autoReorderEnabled === false
                    ? 'Automated AI reorder suggestions are currently disabled in Settings → Preferences.'
                    : 'All products are above their low-stock thresholds and 14-day reorder points.'}
                </div>
              )}
            </div>
          </div>

          {/* Right: Top Selling Products */}
          <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
            <h2 className="font-bold text-sm text-slate-900 mb-3">Top Selling Products (Last 30 Days)</h2>
            <div className="space-y-3.5">
              {data.topProducts.map(tp => (
                <div key={tp.productId || tp.name} className="flex items-center gap-3">
                  <span className="w-9 h-9 bg-slate-100 rounded-xl grid place-items-center text-sm shrink-0">
                    {tp.name.toLowerCase().includes('laptop')
                      ? '💻'
                      : tp.name.toLowerCase().includes('mouse')
                      ? '🖱'
                      : tp.name.toLowerCase().includes('keyboard')
                      ? '⌨'
                      : '🖥'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-800 truncate">{tp.name}</span>
                      <span className="text-slate-500 font-medium">
                        {tp.sold} sold · ৳ {Number(tp.revenue || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: `${Math.max(tp.sharePct || 40, 15)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {data.topProducts.length === 0 && (
                <div className="text-center py-6 text-xs text-slate-400">No sales recorded in the last 30 days.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Demand Analysis, Slow-Moving & Model Evaluation */}
      {(tab === 'Overview' || tab === 'Demand Analysis') && (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-sm text-slate-900 mb-2">Slow-Moving Products (30-Day Analysis)</h3>
            <p className="text-xs text-slate-500 mb-3">
              Products currently in stock with zero sales velocity in the last 30 days.
            </p>
            <div className="space-y-2.5 text-xs">
              {(data.slowMoving || []).map(item => (
                <div
                  key={item.productId || item.product}
                  className="border border-slate-100 rounded-xl p-3 flex justify-between items-center"
                >
                  <div>
                    <div className="font-bold text-slate-800">
                      {item.product}{' '}
                      <span className="text-slate-400 font-normal">({item.category})</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{item.suggestion}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-slate-700">{item.stock} in stock</div>
                    <div className="text-[11px] text-slate-400">
                      Capital: ৳ {Number(item.tiedCapital || 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900 mb-2">
                Sales Trend &amp; Forecasting Model Evaluation
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs mt-3">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-slate-500">Revenue This Month</div>
                  <div className="text-lg font-extrabold text-slate-900 mt-1">
                    ৳ {Number(data.revenueThisMonth || 0).toLocaleString()}
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-slate-500">Profit This Month</div>
                  <div className="text-lg font-extrabold text-emerald-600 mt-1">
                    ৳ {Number(data.profitThisMonth || 0).toLocaleString()}
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-slate-500">Holt Model Walk-Forward MAE</div>
                  <div className="text-lg font-extrabold text-blue-600 mt-1">
                    {data.modelEvaluation?.maeModel ?? '—'}
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-slate-500">7-Day SMA Baseline MAE</div>
                  <div className="text-lg font-extrabold text-slate-700 mt-1">
                    {data.modelEvaluation?.maeBaseline ?? '—'}
                  </div>
                </div>
              </div>
            </div>
            {data.modelEvaluation && (
              <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1.5">
                <div>
                  <strong>Methodology:</strong> {data.modelEvaluation.methodology} evaluated across{' '}
                  {data.modelEvaluation.evaluatedProducts} active products over a{' '}
                  {data.modelEvaluation.windowDays}-day window against {data.modelEvaluation.baselineMethod}.
                </div>
                {Array.isArray(data.modelEvaluation.assumptionsAndLimitations) && (
                  <ul className="list-disc pl-4 space-y-0.5 text-[10px] text-slate-500">
                    {data.modelEvaluation.assumptionsAndLimitations.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
