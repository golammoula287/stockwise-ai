import { useEffect, useState } from 'react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCurrency, formatUnits } from '../lib/formatters';

const shortNumber=value=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(value);
export default function ProductSalesChart({ products=[], currency='৳', period }) {
  const [metric,setMetric]=useState('revenue');
  const [selected,setSelected]=useState(null);
  useEffect(()=>setSelected(null),[products,period]);
  const rows=products.filter(p=>p.sold>0).map(p=>({...p,key:p.productId||p.name})).sort((a,b)=>(Number(b[metric])||0)-(Number(a[metric])||0));
  const total=rows.reduce((sum,p)=>sum+(Number(p[metric])||0),0);
  const active=rows.find(p=>p.key===selected)||rows[0];
  const value=v=>metric==='revenue'?formatCurrency(v,currency):formatUnits(v);
  const detail=p=><><strong>{p.name}</strong><span>Revenue: {formatCurrency(p.revenue||0,currency)}</span><span>Quantity: {formatUnits(p.sold)}</span><span>{total>0?`${((Number(p[metric])||0)/total*100).toFixed(1)}%`:'0%'} of displayed {metric==='revenue'?'revenue':'units sold'}</span></>;
  return <section className="insights-panel product-sales-chart">
    <div className="insights-section-heading"><div><h2>Product sales</h2><p>Compare product performance · selected period</p></div></div>
    <div className="product-chart-toolbar"><div role="group" aria-label="Product sales measure"><button aria-pressed={metric==='revenue'} onClick={()=>setMetric('revenue')}>Revenue</button><button aria-pressed={metric==='sold'} onClick={()=>setMetric('sold')}>Units sold</button></div><span>{rows.length} products</span></div>
    {!rows.length?<p className="insights-empty">No sales recorded in this period.</p>:<>
      <div className="product-chart-summary"><div><span>{metric==='revenue'?'Displayed revenue':'Displayed units sold'}</span><strong>{value(total)}</strong></div><div><span>Leading product</span><strong>{rows[0].name}</strong></div></div>
      <div className="product-chart-canvas" style={{height:Math.max(220,rows.length*53+45)}} role="img" aria-label={`Product sales ranked by ${metric==='revenue'?'revenue':'units sold'}. Use the product selector below for exact values.`}>
        <ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{top:8,right:22,bottom:10,left:0}} barSize={17}>
          <CartesianGrid horizontal={false} stroke="#e9edf5" strokeDasharray="3 4"/>
          <XAxis type="number" tickFormatter={shortNumber} allowDecimals={metric==='revenue'} axisLine={false} tickLine={false} tick={{fontSize:10,fill:'#64748b'}}/>
          <YAxis type="category" dataKey="name" width={96} axisLine={false} tickLine={false} tick={({x,y,payload})=><text x={x-6} y={y} dy={4} textAnchor="end" fontSize={11} fill="#334155">{payload.value.length>15?payload.value.slice(0,13)+'…':payload.value}</text>}/>
          <Tooltip cursor={{fill:'#f0f4fc'}} content={({active,payload})=>active&&payload?.length?<div className="product-chart-tooltip">{detail(payload[0].payload)}</div>:null}/>
          <Bar dataKey={metric} name={metric==='revenue'?'Revenue':'Units sold'} radius={[0,4,4,0]} isAnimationActive={false} onClick={p=>setSelected(p.key)} cursor="pointer">{rows.map((p,index)=><Cell key={p.key} fill={selected===p.key?'#091540':index===0?'#1b2cc1':'#7692ff'}/>)}</Bar>
        </BarChart></ResponsiveContainer>
      </div>
      <div className="product-chart-detail"><label htmlFor="product-sales-detail">Explore a product<select aria-label="Explore a product" id="product-sales-detail" value={active.key} onChange={e=>setSelected(e.target.value)}>{rows.map(p=><option key={p.key} value={p.key}>{p.name}</option>)}</select></label><div aria-live="polite" className="product-chart-values">{detail(active)}</div></div>
      <p className="insights-panel-footnote">Hover or tap a bar for details. Shares compare the products shown here.</p>
    </>}
  </section>;
}
