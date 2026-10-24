const businessFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'});
const cents=value=>Math.round((Number(value)||0)*100);
const amount=value=>value/100;
const total=(list,key)=>amount(list.reduce((sum,item)=>sum+cents(item[key]),0));
export function currentBusinessMonth() { return businessDate(new Date()).slice(0,7); }
function businessDate(value) {
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
  const parts=businessFormatter.formatToParts(date);
  const get=type=>parts.find(part=>part.type===type)?.value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function monthKeys(month) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000||Number(month.slice(0,4))>2100)throw new Error('Choose a valid month.');
  const [year,index]=month.split('-').map(Number);const previous=new Date(Date.UTC(year,index-2,1));
  return {month,previousMonth:`${previous.getUTCFullYear()}-${String(previous.getUTCMonth()+1).padStart(2,'0')}`,days:new Date(Date.UTC(year,index,0)).getUTCDate(),previousDays:new Date(Date.UTC(year,index-1,0)).getUTCDate()};
}
export function monthlyAnalytics({products=[],sales=[],month=currentBusinessMonth(),currency='৳'}) {
  const keys=monthKeys(month);const selected=sales.filter(s=>businessDate(s.createdAt).startsWith(month));const prior=sales.filter(s=>businessDate(s.createdAt).startsWith(keys.previousMonth));
  const metrics=list=>({revenue:total(list,'total'),profit:total(list,'profit'),orders:list.length,averageOrder:list.length?amount(Math.round(list.reduce((n,s)=>n+cents(s.total),0)/list.length)):0});
  const current=metrics(selected),previous=metrics(prior);const today=businessDate(new Date());
  const points=Array.from({length:Math.max(keys.days,keys.previousDays)},(_,index)=>{const day=index+1;const sum=(list)=>total(list.filter(s=>Number(businessDate(s.createdAt).slice(-2))===day),'total');return {day,current:day>keys.days||(month===today.slice(0,7)&&day>Number(today.slice(-2)))?null:sum(selected),previous:day>keys.previousDays?null:sum(prior)};});
  const items=new Map();for(const sale of selected)for(const item of sale.items||[]){const key=item.productId||item.product||item.name;const entry=items.get(key)||{name:item.name||item.productName||'Product',quantity:0,revenue:0};entry.quantity+=Number(item.quantity)||0;entry.revenue+=cents(item.subtotal);items.set(key,entry);}
  const due=amount(selected.reduce((n,s)=>n+Math.max(0,cents(s.due)),0));const collected=amount(selected.reduce((n,s)=>n+cents(s.amountPaid??s.total),0));
  return {...keys,currency,current,previous,changes:Object.fromEntries(Object.keys(current).map(key=>[key,previous[key]?Math.round((current[key]-previous[key])/previous[key]*100):null])),points,topProducts:[...items.values()].map(item=>({...item,revenue:amount(item.revenue)})).sort((a,b)=>b.revenue-a.revenue).slice(0,5),payments:{collected,due,allTimeDue:amount(sales.reduce((n,s)=>n+Math.max(0,cents(s.due)),0)),unpaidInvoices:sales.filter(s=>(s.due||0)>0).length},inventory:{products:products.length,lowStock:products.filter(p=>p.stock<=(p.lowStockThreshold??5)).length,outOfStock:products.filter(p=>p.stock===0).length},recent:[...selected].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6).map(s=>({id:s.id||s._id,invoiceNumber:s.invoiceNumber,customer:s.customerName,total:s.total,due:s.due||0,date:s.createdAt})),partialMonth:month===today.slice(0,7)};
}
