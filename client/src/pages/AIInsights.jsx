import ProductSalesChart from '../components/ProductSalesChart';
import { useConfirm } from '../context/ConfirmContext';
import { insightsPeriod } from '../../../shared/insightsPeriod.mjs';
import { currentBusinessMonth } from '../../../shared/dashboardAnalytics.mjs';
import { useEffect, useState } from 'react';
import { isDemoSandbox } from '../lib/demoSandbox';
import { useDemoMode } from '../context/DemoModeContext';
import { useAuth } from '../context/AuthContext';
import { downloadInsights, printInsights, insightDate } from '../lib/insightsReport.mjs';
import SearchBox from '../components/SearchBox';
import api from '../lib/api';
import { formatUnits, formatCurrency } from '../lib/formatters';

export default function AIInsights() {
  const demoReadOnly = useDemoMode();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [periodMode,setPeriodMode]=useState('30');
  const [month,setMonth]=useState(currentBusinessMonth);
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [appliedPeriod,setAppliedPeriod]=useState({days:30});
  const [periodError,setPeriodError]=useState('');
  const [data, setData] = useState(null);
  const [currency, setCurrency] = useState('৳');
  const [generatedAt, setGeneratedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restockingId, setRestockingId] = useState(null);
  const [err, setErr] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const sandbox = isDemoSandbox();
  const load = async (params=appliedPeriod) => {
    setLoading(true); setErr('');
    try {
      const [res, settings] = await Promise.all([api.get('/ai/insights',{params}), api.get('/settings')]);
      setAppliedPeriod(params); setData(res.data); setGeneratedAt(res.data.generatedAt || new Date().toISOString());
      setCurrency(settings.data.business?.currency || '৳');
    } catch (e) { setErr(e.response?.data?.message || 'Could not load insights. Please try again.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const quickRestock = async rec => {
    if (restockingId) return;
    if(!await confirm({title:'Add stock to inventory?',message:`Add ${formatUnits(rec.suggested)} to ${rec.product}? Current stock: ${rec.stock}. New stock: ${Number(rec.stock)+Number(rec.suggested)}. Only confirm after the goods have arrived. This updates inventory immediately; it does not place a supplier order.`,confirmLabel:'Confirm stock received'}))return;
    setMessage(''); setErr(''); setRestockingId(rec.productId);
    try {
      await api.patch(`/products/${rec.productId}/stock`, { delta: rec.suggested, note: `Insights restock recommendation: ${formatUnits(rec.suggested)}` });
      setMessage(`Added ${formatUnits(rec.suggested)} to ${rec.product}.`); await load();
    } catch (e) { setErr(e.response?.data?.message || 'Could not restock this product.'); }
    finally { setRestockingId(null); }
  };
  const recommendations = data?.recommendations || [];
  const filters = [{ key: 'all', label: 'All products', count: recommendations.length }, { key: 'urgent', label: 'High priority', count: recommendations.filter(r=>r.priority==='High').length }, { key: 'empty', label: 'Out of stock', count: recommendations.filter(r=>r.stock===0).length }];
  const filtered = recommendations.filter(r=>`${r.product} ${r.sku||''}`.toLowerCase().includes(search.trim().toLowerCase()) && (priorityFilter==='all' || (priorityFilter==='urgent' ? r.priority==='High' : r.stock===0)));
  const topProducts = [...(data?.topProducts || [])].sort((a,b)=>(b.revenue||0)-(a.revenue||0));
  const totalCost = recommendations.reduce((sum,r)=>sum+(r.estimatedCost||0),0);
  const money = value => formatCurrency(value,currency);
  const options = { currency, sandbox, generatedAt };
  const applyPeriod=e=>{e.preventDefault();const params=periodMode==='month'?{month}:periodMode==='range'?{startDate:from,endDate:to}:{days:Number(periodMode)};try{if(periodMode==='month'&&!month)throw Error('Choose a month.');if(periodMode==='range'&&(!from||!to))throw Error('Choose both dates.');insightsPeriod(params);setPeriodError('');setMessage('');load(params);}catch(error){setPeriodError(error.message);}};
  const exportReport = type => {
    try {
      if(type==='csv') { downloadInsights(data,options); setMessage('The full insights report has been downloaded.'); }
      else if(!printInsights(data,options)) setErr('Allow popups for this site to open the printable report.');
    } catch (_) { setErr('Could not export the report. Please try again.'); }
  };
  return (
    <div className="insights-page" aria-busy={loading}>
      <header className="insights-header">
        <div><h1>AI Insights</h1><p>Understand demand. Prioritize your next stock order.</p></div>
        <div className="insights-actions">
          <button onClick={()=>load()} disabled={loading || Boolean(restockingId)}>Refresh</button>
          <button onClick={()=>exportReport('pdf')} disabled={!data || loading}>Print / PDF</button>
          <button className="insights-primary" onClick={()=>exportReport('csv')} disabled={!data || loading}>Export CSV</button>
        </div>
      </header>
      <form className="insights-period" onSubmit={applyPeriod}><fieldset disabled={loading || Boolean(restockingId)}><legend>Analysis period</legend><div className="insights-period-fields">
        <label>Time period<select aria-label="Time period" value={periodMode} onChange={e=>setPeriodMode(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="month">Choose month</option><option value="range">Custom date range</option></select></label>
        {periodMode==='month'&&<label>Month<input type="month" min="2000-01" max={currentBusinessMonth()} value={month} onChange={e=>setMonth(e.target.value)}/></label>}
        {periodMode==='range'&&<><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></>}
        <button type="submit">{loading?'Loading…':'Apply period'}</button></div></fieldset>{periodError&&<p role="alert">{periodError}</p>}</form>
      {err && <div role="alert" className="insights-notice insights-error"><span>{err}</span><button onClick={()=>setErr('')} aria-label="Dismiss error">×</button></div>}
      {message && <div role="status" className="insights-notice"><span>{message}</span><button onClick={()=>setMessage('')} aria-label="Dismiss message">×</button></div>}
      {!data ? <div className="insights-empty">{loading ? 'Preparing your insights…' : <><p>Insights are unavailable right now.</p><button onClick={()=>load()}>Try again</button></>}</div> : <>
        <div className="insights-meta"><span>{sandbox ? 'Demo · daily-average estimates' : '14-day demand forecast'}</span><span>Period: {data.period?.label || 'Last 30 days'} · {data.period?.days || 30} days</span><span>Updated {insightDate(generatedAt)} · Bangladesh time</span></div>
        <section className="insights-metrics" aria-label="Inventory priorities">
          <div><span>Low-stock alerts</span><strong>{data.thresholdAlertCount ?? data.lowStockCount ?? 0}</strong><p>At or below the stock threshold</p></div>
          <div><span>Forecast reorders</span><strong>{data.forecastReorderCount ?? 0}</strong><p>Additional demand-based alerts</p></div>
          <div><span>Recommended order cost</span><strong>{money(totalCost)}</strong><p>{recommendations.length} suggested {recommendations.length===1?'order':'orders'} at product cost</p></div>
          <div><span>Revenue in period</span><strong>{money(data.revenueThisMonth ?? 0)}</strong><p>Profit: {money(data.profitThisMonth ?? 0)}</p></div>
        </section>
        <section className="insights-summary"><h2>Your next steps</h2><p>{data.summary}</p><span>{sandbox ? 'Estimates use sales in the selected period and current stock. Demo changes reset on refresh.' : 'Demand forecasts use selected-period sales and current stock. Review suggested quantities before ordering.'} Forecasts are not guarantees.</span></section>
        <section className="insights-panel">
          <div className="insights-section-heading"><div><h2>Restock priorities</h2><p>Choose a priority, review the suggestion, then add stock when it arrives.</p></div><span className="insights-status">Suggestions {data.autoReorderEnabled===false?'off':'on'}</span></div>
          {data.autoReorderEnabled===false && <p className="insights-muted-note">{data.disabledMessage || 'Reorder suggestions are disabled. Enable them in Settings → Preferences to see suggested quantities.'}</p>}
          <div className="insights-quick-filters" role="group" aria-label="Filter restock recommendations">{filters.map(filter=><button key={filter.key} aria-pressed={priorityFilter===filter.key} onClick={()=>setPriorityFilter(filter.key)}>{filter.label}<span>{filter.count}</span></button>)}</div>
          <div className="insights-search"><SearchBox label="Search restock recommendations" placeholder="Product name or SKU" value={search} onChange={setSearch}/><span role="status">{filtered.length} of {recommendations.length} recommendations</span></div>
          <div className="insights-table-scroll" tabIndex={0} role="region" aria-label="Restock recommendations">
            <table className="insights-table"><thead><tr><th>Product</th><th>Stock / threshold</th><th>14-day demand</th><th>Suggested order</th><th>Estimated cost</th><th>Action</th></tr></thead><tbody>
              {filtered.map(rec=><tr key={rec.productId || rec.product}>
                <td><strong>{rec.product}</strong><span>{rec.sku || 'No SKU'}</span><span className={`insights-priority ${rec.priority==='High'?'is-high':'is-normal'}`}>{rec.priority || 'Normal'} priority</span><details><summary>See recommendation details</summary><p>{rec.explainability || (rec.triggerType==='threshold'?'Stock has reached its low-stock threshold.':'Expected demand has reached the reorder point.')}</p><p>Safety stock: {formatUnits(rec.safetyStock)} · Reorder point: {formatUnits(rec.reorderPoint ?? rec.safetyStock)}</p><p>14-day stockout risk: {rec.stockoutProbability == null ? 'Not calculated for demo estimates' : `${rec.stockoutProbability}%`}</p></details></td>
                <td><strong>{formatUnits(rec.stock)}</strong><span>Threshold: {rec.lowStockThreshold}</span></td>
                <td>{formatUnits(rec.forecast14d)}</td><td><strong>{formatUnits(rec.suggested)}</strong><span>{rec.triggerLabel || (rec.triggerType==='threshold'?'Low stock':'Forecast demand')}</span></td><td>{money(rec.estimatedCost || 0)}</td>
                <td><button className="insights-restock" onClick={()=>quickRestock(rec)} disabled={Boolean(restockingId) || loading || demoReadOnly || (user?.role!=='admin' && !sandbox)}>{restockingId===rec.productId?'Adding…':`Add ${rec.suggested} units`}</button></td>
              </tr>)}
              {!filtered.length && <tr><td colSpan={6} className="insights-empty">{search.trim() || priorityFilter!=='all'?<><p>No recommendations match your filters.</p><button onClick={()=>{setSearch('');setPriorityFilter('all');}}>Clear filters</button></>:data.autoReorderEnabled===false?'Suggestions are currently disabled.':'No restock recommendations right now.'}</td></tr>}
            </tbody></table>
          </div>
          <p className="insights-panel-footnote">Adding stock updates inventory immediately. It does not place a supplier order. Exports include the full report, regardless of search.</p>
        </section>
        <div className="insights-analysis-grid">
          <ProductSalesChart products={topProducts} currency={currency} period={data.period?.label}/>
          <section className="insights-panel"><div className="insights-section-heading"><div><h2>Slow-moving inventory</h2><p>Current stock with no sales in the selected period</p></div></div>
            <div className="insights-slow-list">{(data.slowMoving||[]).map(p=><div key={p.productId||p.product}><div><strong>{p.product}</strong><span>{p.category || 'Uncategorized'} · {formatUnits(p.stock)} in stock</span><p>{p.suggestion || 'Review pricing, placement, or promotions before reordering.'}</p></div><div><strong>{money(p.tiedCapital||0)}</strong><span>Capital at cost</span></div></div>)}{!data.slowMoving?.length&&<p className="insights-empty">No idle-stock products found in this analysis.</p>}</div>
          </section>
        </div>
        <details className="insights-panel insights-method"><summary>How these insights are calculated</summary>
          <div className="insights-method-content"><p>{sandbox ? 'The demo estimates 14-day demand from average daily sales over the selected period. These estimates use browser data and do not run the server Holt model. Stock quantities reflect current inventory, not historical balances. Stockout probabilities and model validation scores are unavailable.' : data.modelEvaluation?.methodology || 'Demand is estimated from recorded product sales.'}</p>
            {data.modelEvaluation && <><div className="insights-validation"><div><span>Model average error</span><strong>{data.modelEvaluation.maeModel ?? '—'} units/day</strong></div><div><span>Baseline average error</span><strong>{data.modelEvaluation.maeBaseline ?? '—'} units/day</strong></div><div><span>Evaluated products</span><strong>{data.modelEvaluation.evaluatedProducts ?? '—'}</strong></div></div><p>Mean absolute error measures the average size of daily prediction errors. Lower values indicate better performance. Baseline: {data.modelEvaluation.baselineMethod}. Evaluation window: {data.modelEvaluation.windowDays} days.</p><ul>{(data.modelEvaluation.assumptionsAndLimitations||[]).map((note,index)=><li key={index}>{note}</li>)}</ul></>}
          </div>
        </details>
      </>}
    </div>
  );
}
