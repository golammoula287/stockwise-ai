export const insightDate = value => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export function insightSections(data, { currency = '৳', sandbox = false } = {}) {
  const recs = data.recommendations || [];
  const quality = data.modelEvaluation;
  const unavailable = value => value ?? 'Not available';
  return [
    { title: 'Business summary', headers: ['Metric', 'Value'], rows: [
      ['Summary', data.summary || 'No summary available.'],
      ['Calculation method', sandbox ? 'Selected-period daily sales average; browser demo' : quality?.methodology || 'Holt demand forecasting'],
      ['Analysis period', data.period?.label || 'Last 30 days'], ['Days analyzed', data.period?.days || 30], ['Stock basis', 'Current inventory, not historical balances'], ['Currency', currency], ['Revenue in period', data.revenueThisMonth ?? 0], ['Profit in period', data.profitThisMonth ?? 0],
      ['Low-stock alerts', data.thresholdAlertCount ?? data.lowStockCount ?? 0],
      ['Forecast reorders', data.forecastReorderCount ?? 0],
      ['Reorder suggestions', data.autoReorderEnabled === false ? 'Disabled' : 'Enabled'],
      ['Recommended order cost', Math.round(recs.reduce((sum,r)=>sum+(Number(r.estimatedCost)||0),0)*100)/100],
      ['Forecast horizon', '14 days'], ['Sales analysis window', `${data.period?.days || 30} days`],
      ['Note', sandbox ? 'Browser demo changes reset on refresh. Estimates are not guarantees.' : 'Forecasts depend on recorded sales and are not guarantees.'],
    ] },
    { title: 'Restock recommendations', headers: ['Product', 'SKU', 'Priority', 'Trigger', 'Stock (units)', 'Threshold (units)', '14-day demand (units)', 'Safety stock (units)', 'Reorder point (units)', 'Suggested order (units)', `Estimated cost (${currency})`, 'Stockout risk (%)', 'Reason'], rows: recs.map(r=>[r.product,r.sku||'',r.priority,r.triggerLabel||r.triggerType,r.stock,r.lowStockThreshold,r.forecast14d,r.safetyStock,r.reorderPoint,r.suggested,r.estimatedCost,unavailable(r.stockoutProbability),r.explainability||'']) },
    { title: 'Product sales · selected period', headers: ['Product', 'Units sold', `Revenue (${currency})`], rows: (data.topProducts||[]).map(p=>[p.name,p.sold,p.revenue??0]) },
    { title: 'Slow-moving inventory · no sales in selected period', headers: ['Product', 'Category', 'Stock (units)', `Capital at cost (${currency})`, 'Suggested action'], rows: (data.slowMoving||[]).map(p=>[p.product,p.category,p.stock,p.tiedCapital,p.suggestion]) },
    { title: 'Forecast method and validation', headers: ['Metric', 'Value'], rows: quality ? [
      ['Method',quality.methodology],['Baseline',quality.baselineMethod],['Mean absolute error (units/day)',unavailable(quality.maeModel)],['Baseline mean absolute error (units/day)',unavailable(quality.maeBaseline)],['Evaluated products',quality.evaluatedProducts],['Evaluation window (days)',quality.windowDays],...(quality.assumptionsAndLimitations||[]).map(note=>['Limitation',note]),
    ] : [['Validation',sandbox ? 'No model validation metrics available for browser demo estimates.' : 'No model validation metrics available for this report.']] },
  ];
}
export function insightsCSV(data, options) {
  const cell = value => { let text=String(value??''); if (/^[=+@\-\t\r]/.test(text)) text="'"+text; return '"'+text.replaceAll('"','""')+'"'; };
  const rows = [['StockWise AI · insights report'],['Generated (Bangladesh time)',insightDate(options.generatedAt)], ...insightSections(data,options).flatMap(s=>[[],[s.title],s.headers,...(s.rows.length?s.rows:[['No records']])])];
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
export function downloadInsights(data, options) {
  const url=URL.createObjectURL(new Blob([insightsCSV(data,options)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a'); link.href=url; link.download=`stockwise-ai-insights-${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(options.generatedAt))}.csv`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function printInsights(data, options) {
  const popup=window.open('','_blank','width=1100,height=850'); if(!popup) return false;
  popup.opener=null;
  const doc=popup.document;doc.title='StockWise AI · Insights report';
  const add=(tag,text,parent=doc.body)=>{const node=doc.createElement(tag);node.textContent=text;parent.append(node);return node;};
  const style=doc.createElement('style');style.textContent='body{font:13px/1.6 system-ui,sans-serif;color:#091540;max-width:1100px;margin:30px auto;padding:0 20px}h1{font-size:26px}h2{font-size:17px;margin-top:32px}p{color:#64748b}table{border-collapse:collapse;width:100%;font-size:11px;overflow-wrap:anywhere}th,td{text-align:left;padding:9px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}th{background:#f1f5f9}thead{display:table-header-group}tr{break-inside:avoid}button{padding:10px 18px;border:1px solid #cbd5e1;border-radius:6px;background:white;color:#091540;cursor:pointer}@page{size:A4 landscape;margin:12mm}@media print{body{margin:0;padding:0;max-width:none}button{display:none}}';doc.head.append(style);
  const button=add('button','Print / Save PDF');button.onclick=()=>popup.print();
  add('h1','StockWise AI · Insights report');add('p',`Generated ${insightDate(options.generatedAt)} · Bangladesh time · Currency: ${options.currency}`);
  for(const section of insightSections(data,options)) {
    add('h2',section.title);
    if(!section.rows.length){add('p','No records.');continue;}
    const table=add('table','');const head=add('thead','',table);const row=add('tr','',head);section.headers.forEach(h=>add('th',h,row));
    const body=add('tbody','',table);section.rows.forEach(values=>{const tr=add('tr','',body);values.forEach(v=>add('td',v??'—',tr));});
  }
  popup.focus();return true;
}
