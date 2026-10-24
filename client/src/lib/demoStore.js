import { insightsPeriod } from '../../../shared/insightsPeriod.mjs';
import { salesPeriod } from '../../../shared/salesPeriod.mjs';
import { monthlyAnalytics } from '../../../shared/dashboardAnalytics.mjs';
// Browser-memory sandbox. It never writes to the shared API or persists business data.
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const id = () => globalThis.crypto.randomUUID();
const copy = value => structuredClone(value);
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function number(value, label, min = 0, integer = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > 100000000 || (integer && !Number.isInteger(parsed))) fail(`${label} is invalid.`);
  return parsed;
}
export function createDemoStore(user = {}, { clock = () => new Date() } = {}) {
  const now = () => clock().toISOString();
  const seedDate = new Date(clock().getTime() - 180 * 86400000).toISOString();
  const definitions = [['Laptop','Electronics',65000,50000,20],['Wireless Mouse','Accessories',850,500,40],['Keyboard','Accessories',1500,950,4],['Monitor','Electronics',18500,14000,12],['USB Cable','Accessories',250,100,0],['Notebook','Stationery',120,65,60],['Bluetooth Speaker','Audio',3200,2200,18],['Webcam','Electronics',2800,1800,9],['Laptop Stand','Accessories',1800,1100,3],['Portable SSD','Storage',8500,6600,15],['Desk Organizer','Stationery',650,350,24],['USB-C Hub','Accessories',2200,1400,14]];
  const products = definitions.map(([name, category, price, cost, stock], index) => ({ id: `demo-product-${index+1}`, _id: `demo-product-${index+1}`, name, category, price, cost, stock, sku: `SW-${String(index+1).padStart(3,'0')}`, lowStockThreshold: 5, description: '', customFields: {}, createdAt: seedDate }));
  const customers = ['Rahim Ahmed','Nusrat Khan','Tanvir Islam','Farhana Akter','Sajid Hasan','Maliha Rahman','Imran Hossain','Nabila Chowdhury'].map((name,index) => ({ id: `demo-customer-${index+1}`, _id: `demo-customer-${index+1}`, name, phone: `0170000000${index}`, email: '', address: '', createdAt: seedDate }));
  const settings = { profile: { name: user.name || 'Demo visitor', email: user.email || '', phone: '', role: user.role || 'staff' }, business: { name: 'StockWise Demo Shop', currency: '৳', taxRate: 0, lowStockThresholdDefault: 5, businessAddress: 'Dhaka, Bangladesh' }, preferences: { lowStockAlerts: true, autoReorderSuggestions: true, emailReports: false, dateFormat: 'MMM DD, YYYY', allowDues: false, productFields: [] }, capabilities: { smtpConfigured: false, sandbox: true } };
  const sales = []; const logs = []; let sequence = 1000;
  // Fictional six-month history: varied baskets, demand and payment methods.
  // Stock represents the current inventory snapshot; past purchases were replenished.
  const todayStart=insightsPeriod({days:7},clock()).end-86400000;
  for (let day = 0; day < 180; day++) {
    const orders=1+(day%3);
    for(let order=0;order<orders;order++) {
      // Keep two products idle and one with older-only sales for period comparisons.
      const eligible=day<75?9:10;
      const first=(day*7+order*3)%eligible;
      const basket=[first];
      if((day+order)%3===0)basket.push((first+1)%eligible);
      const items=basket.map((index,line)=>{
        const product=products[index];
        const quantity=index===0||index===3||index===9?1:1+((day+order+line)%4);
        return {product:product.id,productId:product.id,name:product.name,productName:product.name,category:product.category,quantity,price:product.price,subtotal:money(product.price*quantity)};
      });
      const customer=customers[(day+order)%customers.length];
      const subtotal=money(items.reduce((sum,item)=>sum+item.subtotal,0));
      const discount=(day+order)%7===0?money(subtotal*.05):0;
      const total=money(subtotal-discount);
      const totalCost=money(items.reduce((sum,item)=>sum+products.find(p=>p.id===item.productId).cost*item.quantity,0));
      const saleId=id();
      const stamp=Math.min(clock().getTime(),todayStart-day*86400000+(9+order*3)*3600000);
      sales.push({id:saleId,_id:saleId,invoiceNumber:`DEMO-${++sequence}`,customerId:customer.id,customerName:customer.name,customerPhone:customer.phone,subtotal,discount,taxRate:0,taxAmount:0,total,totalCost,profit:money(total-totalCost),amountPaid:total,due:0,paymentMethod:['cash','card','bkash'][(day+order)%3],createdAt:new Date(stamp).toISOString(),items});
    }
  }
  sales.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  function customerStats(customer) {
    const history = sales.filter(sale => sale.customerId === customer.id);
    return { ...customer, totalSpent: money(history.reduce((sum,sale)=>sum+sale.total,0)), totalOrders: history.length, totalPurchases: history.length, due: money(history.reduce((sum,sale)=>sum+(sale.due||0),0)) };
  }
  function productStatus(product) { return { ...product, status: product.stock === 0 ? 'Out of Stock' : product.stock <= product.lowStockThreshold ? 'Low Stock' : 'In Stock' }; }
  function stockLog(product, delta, type, note) { logs.unshift({ id: id(), product: product.id, productId: product.id, productName: product.name, category: product.category, type, change: delta, previousStock: product.stock-delta, newStock: product.stock, note: note || '', createdAt: now(), performedBy: { name: user.name || 'Demo visitor' } }); }
  function period(label = 'This Month') {
    const date = clock(); const previous = clock();
    if (label === 'All Time') return { start: new Date(0), previous: new Date(0) };
    if (label === 'Today') { date.setHours(0,0,0,0); previous.setTime(date.getTime()-86400000); }
    else if (label.includes('7') || label.includes('30')) { const days=label.includes('7')?7:30; date.setTime(date.getTime()-days*86400000); previous.setTime(date.getTime()-days*86400000); }
    else { date.setDate(1); date.setHours(0,0,0,0); previous.setMonth(date.getMonth()-1,1); previous.setHours(0,0,0,0); }
    return { start: date, previous };
  }
  function stats(label = 'This Month') {
    const { start, previous } = period(label); const current = sales.filter(s=>new Date(s.createdAt)>=start); const before = label==='All Time'?current:sales.filter(s=>new Date(s.createdAt)>=previous && new Date(s.createdAt)<start);
    const sum = (list,key) => money(list.reduce((n,s)=>n+(s[key]||0),0)); const pct=(a,b)=>b?Math.round((a-b)/b*100):a?100:0;
    return { dateFilter: label, currency: settings.business.currency, totalProducts: products.length, totalSales: current.length, allTimeSales: sales.length, totalRevenue: sum(current,'total'), totalProfit: sum(current,'profit'), allTimeRevenue: sum(sales,'total'), allTimeProfit: sum(sales,'profit'), totalDue: sum(sales,'due'), lowStockCount: products.filter(p=>p.stock<=p.lowStockThreshold).length, outOfStockCount: products.filter(p=>p.stock===0).length, changes: { products: 0, sales: pct(current.length,before.length), revenue: pct(sum(current,'total'),sum(before,'total')) } };
  }
  function insights(query={}) {
    const selectedPeriod=insightsPeriod(query,clock());
    const recent=sales.filter(s=>Date.parse(s.createdAt)>=selectedPeriod.start&&Date.parse(s.createdAt)<selectedPeriod.end);
    const totals=products.map(p=>{const items=recent.flatMap(s=>s.items).filter(i=>(i.productId||i.product)===p.id);return {productId:p.id,name:p.name,sold:items.reduce((s,i)=>s+i.quantity,0),revenue:money(items.reduce((s,i)=>s+i.subtotal,0))};});
    const recommendations=products.filter(p=>p.stock<=p.lowStockThreshold).map(p=>{const sold=totals.find(t=>t.productId===p.id)?.sold||0;const forecast14d=Math.ceil(sold/selectedPeriod.days*14);const suggested=Math.max(1,p.lowStockThreshold*2+forecast14d-p.stock);return {productId:p.id,product:p.name,sku:p.sku,stock:p.stock,lowStockThreshold:p.lowStockThreshold,forecast14d,safetyStock:p.lowStockThreshold,reorderPoint:p.lowStockThreshold+forecast14d,suggested,estimatedCost:money(suggested*p.cost),priority:p.stock===0?'High':'Medium',triggerType:'threshold',explainability:`Demo estimate: average daily sales over ${selectedPeriod.days} selected days, not the server Holt model.`};});
    recommendations.sort((a,b)=>(a.stock===0?-1:0)-(b.stock===0?-1:0)||a.stock-b.stock);
    const alertCount=recommendations.length;
    const leader=[...totals].sort((a,b)=>b.revenue-a.revenue)[0];
    const summary=`${alertCount ? `${alertCount} ${alertCount===1?'product is':'products are'} at or below the low-stock threshold.` : 'All products are above their low-stock thresholds.'} ${leader?.sold ? `${leader.name} leads revenue over the selected period.` : 'No product sales were recorded in the selected period.'} ${settings.preferences.autoReorderSuggestions ? 'Review suggested quantities before adding stock.' : 'Reorder suggestions are disabled in Preferences.'}`;
    return {period:selectedPeriod,summary,autoReorderEnabled:settings.preferences.autoReorderSuggestions,thresholdAlertCount:recommendations.length,forecastReorderCount:0,recommendations:settings.preferences.autoReorderSuggestions?recommendations:[],topProducts:totals.filter(t=>t.sold>0).sort((a,b)=>b.revenue-a.revenue),slowMoving:products.filter(p=>p.stock>0&&!(totals.find(t=>t.productId===p.id)?.sold)).map(p=>({productId:p.id,product:p.name,category:p.category,stock:p.stock,tiedCapital:money(p.stock*p.cost),suggestion:'Review pricing, placement, or promotions before reordering.'})),generatedAt:now(),...{revenueThisMonth:money(recent.reduce((sum,s)=>sum+s.total,0)),profitThisMonth:money(recent.reduce((sum,s)=>sum+s.profit,0))},modelEvaluation:null};
  }
  function handle(method, path, input = {}, query = {}) {
    method = method.toLowerCase(); path = path.replace(/\/$/,'');
    if (path === '/settings' && method === 'get') return copy(settings);
    if (path === '/settings' && method === 'put') {
      const preferences = { ...settings.preferences, ...(input.preferences || {}) };
      if (!preferences.allowDues && sales.some(s=>s.due>0)) fail('Collect outstanding dues before switching to no-due mode.');
      const fields = preferences.productFields || [];
      if (!Array.isArray(fields) || fields.length>12 || fields.some(f=>!f.id || !f.label?.trim() || f.label.length>40 || !['text','number','select'].includes(f.type) || (f.type==='select' && (!Array.isArray(f.options) || !f.options.length || f.options.length>30 || f.options.some(option=>typeof option!=='string'||!option.trim())))) || new Set(fields.map(f=>f.id)).size!==fields.length) fail('Custom product fields are invalid.');
      settings.preferences=preferences;
      settings.business={...settings.business,...Object.fromEntries(['currency','taxRate','businessAddress','businessEmail','businessPhone','lowStockThresholdDefault'].filter(k=>input[k]!==undefined).map(k=>[k,input[k]])),name:input.businessName||settings.business.name};
      settings.profile={...settings.profile,...Object.fromEntries(['name','email','phone'].filter(k=>input[k]!==undefined).map(k=>[k,input[k]]))};
      return copy({...settings,user:{...user,...settings.profile},message:'Demo settings updated. Refresh resets these changes.'});
    }
    if (path === '/settings/password') fail('Password changes are not simulated. Account credentials remain managed by the server.');
    if (path === '/products/categories') return copy([...new Set(products.map(p=>p.category))].map(category=>{const list=products.filter(p=>p.category===category);return {category,count:list.length,totalStock:list.reduce((n,p)=>n+p.stock,0),totalValue:money(list.reduce((n,p)=>n+p.stock*p.price,0)),lowStockCount:list.filter(p=>p.stock<=p.lowStockThreshold).length};}));
    if (path === '/products/stock-history') return copy(logs.map(log=>({...log,sku:products.find(p=>p.id===log.productId)?.sku||null})).filter(log=>(!query.productId||log.productId===query.productId)&&(!query.type||log.type===query.type)&&(!query.search||[log.productName,log.sku].join(' ').toLowerCase().includes(String(query.search).trim().toLowerCase()))).slice(0,200));
    if (path === '/products' && method === 'get') {
      let list=products.map(productStatus); const search=String(query.search||'').toLowerCase();
      if(search)list=list.filter(p=>[p.name,p.sku,p.category,...Object.values(p.customFields||{})].join(' ').toLowerCase().includes(search));
      if(query.category&&!['All','All Categories'].includes(query.category))list=list.filter(p=>p.category===query.category);
      if(query.lowStockOnly==='true')list=list.filter(p=>p.stock<=p.lowStockThreshold);
      else if(query.status&&!['All','All Status'].includes(query.status))list=list.filter(p=>p.status===query.status);
      const sort=query.sortBy;if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name));else if(sort?.startsWith('price'))list.sort((a,b)=>(a.price-b.price)*(sort.endsWith('desc')?-1:1));else if(sort?.startsWith('stock'))list.sort((a,b)=>(a.stock-b.stock)*(sort.endsWith('desc')?-1:1));else if(sort==='newest')list.reverse();
      const limit=Math.min(200,Math.max(1,Number(query.limit)||10)),page=Math.max(1,Number(query.page)||1);return copy({products:list.slice((page-1)*limit,page*limit),total:list.length,page,pages:Math.max(1,Math.ceil(list.length/limit))});
    }
    if (path.startsWith('/products')) {
      const key=path.split('/')[2];const product=products.find(p=>p.id===key);
      if(method==='get'){if(!product)fail('Product not found.',404);return copy(productStatus(product));}
      if(path.endsWith('/stock')&&method==='patch') { if(!product)fail('Product not found.',404);const delta=Number(input.delta);if(!Number.isInteger(delta)||delta===0||product.stock+delta<0||product.stock+delta>10000000)fail('Stock adjustment is invalid.');product.stock+=delta;stockLog(product,delta,delta>0?'restock':'adjustment',input.note);return copy({product:productStatus(product),message:'Stock updated.'}); }
      if(method==='delete'){if(!product)fail('Product not found.',404);if(sales.some(s=>s.items.some(i=>(i.productId||i.product)===key)))fail('Products with sale history cannot be deleted.');products.splice(products.indexOf(product),1);return {message:'Product deleted.'};}
      if(!['post','put'].includes(method))fail('Unsupported demo operation.',405);
      if(method==='put'&&!product)fail('Product not found.',404);
      const name=String(input.name||'').trim();if(!name||!input.category)fail('Name and category are required.');const sku=String(input.sku||'').trim().toUpperCase();if(sku&&products.some(p=>p.sku===sku&&p!==product))fail('SKU is already in use.');
      const fields={};for(const field of settings.preferences.productFields){const value=input.customFields?.[field.id]??'';if(field.required&&String(value).trim()==='')fail(`${field.label} is required.`);if(value!==''&&field.type==='number'&&!Number.isFinite(Number(value)))fail(`${field.label} must be a number.`);if(value!==''&&field.type==='select'&&!field.options?.includes(value))fail(`${field.label} is invalid.`);fields[field.id]=value;}
      const next={name,sku,category:input.category,price:money(number(input.price,'Price')),cost:money(number(input.cost||0,'Cost')),stock:number(input.stock,'Stock',0,true),lowStockThreshold:number(input.lowStockThreshold??5,'Threshold',0,true),description:String(input.description||''),customFields:fields};
      if(product){if(next.stock!==product.stock)fail('Use stock adjustment to change stock.');Object.assign(product,next);return copy(productStatus(product));}
      const keyNew=id();const created={...next,id:keyNew,_id:keyNew,createdAt:now()};products.push(created);stockLog(created,created.stock,'initial','Initial stock');return copy(productStatus(created));
    }
    if(path==='/customers'&&method==='get')return copy(customers.map(customerStats).filter(c=>!query.search||[c.name,c.phone,c.email].join(' ').toLowerCase().includes(String(query.search).toLowerCase())));
    if(path.startsWith('/customers')){
      const key=path.split('/')[2],customer=customers.find(c=>c.id===key);
      if(method==='get'){if(!customer)fail('Customer not found.',404);return copy({customer:customerStats(customer),purchaseHistory:sales.filter(s=>s.customerId===key)});}
      if(method==='delete'){if(!customer)fail('Customer not found.',404);if(sales.some(s=>s.customerId===key))fail('Customers with sale history cannot be deleted.');customers.splice(customers.indexOf(customer),1);return {message:'Customer deleted.'};}
      if(!input.name?.trim()||!input.phone?.trim())fail('Customer name and phone are required.');
      if(method==='put'&&!customer)fail('Customer not found.',404);
      const data={name:input.name.trim(),phone:input.phone.trim(),email:input.email||'',address:input.address||''};if(customer){Object.assign(customer,data);return copy(customerStats(customer));}const keyNew=id();const created={...data,id:keyNew,_id:keyNew,createdAt:now()};customers.unshift(created);return copy(customerStats(created));
    }
    if(path==='/sales'&&method==='get'){const period=salesPeriod(query);let list=sales.filter(s=>(period.start===undefined||(Date.parse(s.createdAt)>=period.start&&Date.parse(s.createdAt)<period.end))&&(!query.customer||s.customerId===query.customer)&&(!query.search||[s.invoiceNumber,s.customerName,s.customerPhone].join(' ').toLowerCase().includes(String(query.search).toLowerCase())));const limit=Math.max(1,Number(query.limit)||50),page=Math.max(1,Number(query.page)||1);return copy({sales:list.slice((page-1)*limit,page*limit),total:list.length,page,pages:Math.max(1,Math.ceil(list.length/limit))});}
    if(path==='/sales'&&method==='post'){
      if(!input.items?.length)fail('Add at least one product.');const grouped=new Map();for(const item of input.items){const key=item.product||item.productId;grouped.set(key,(grouped.get(key)||0)+number(item.quantity,'Quantity',1,true));}
      const items=[...grouped].map(([key,quantity])=>{const p=products.find(x=>x.id===key);if(!p||p.stock<quantity)fail('Insufficient product stock.');return {product:p.id,productId:p.id,name:p.name,productName:p.name,category:p.category,quantity,price:p.price,cost:p.cost,subtotal:money(p.price*quantity)};});
      const subtotal=money(items.reduce((n,i)=>n+i.subtotal,0)),discount=money(number(input.discount||0,'Discount'));if(discount>subtotal)fail('Discount exceeds subtotal.');const taxRate=number(settings.business.taxRate||0,'Tax');if(taxRate>100)fail('Tax rate cannot exceed 100.');const taxAmount=money((subtotal-discount)*taxRate/100),total=money(subtotal-discount+taxAmount);
      const amountPaid=money(input.amountPaid===undefined?total:number(input.amountPaid,'Amount paid'));if(amountPaid>total)fail('Amount paid exceeds total.');const due=money(total-amountPaid);if(due&&!settings.preferences.allowDues)fail('No-due mode requires full payment.');const customer=customers.find(c=>c.id===(input.customer||input.customerId));if(due&&!customer)fail('Select a saved customer for a due sale.');if(!['cash','card','bkash','nagad','other'].includes(input.paymentMethod||'cash'))fail('Invalid payment method.');
      const key=id();const totalCost=money(items.reduce((n,i)=>n+i.cost*i.quantity,0));const sale={id:key,_id:key,invoiceNumber:`DEMO-${++sequence}`,items,customerId:customer?.id||null,customerName:customer?.name||input.customerName||'Walk-in Customer',customerPhone:customer?.phone||input.customerPhone||'',subtotal,discount,taxRate,taxAmount,total,totalCost,profit:money(total-taxAmount-totalCost),amountPaid,due,paymentMethod:input.paymentMethod||'cash',createdAt:now()};
      for(const item of items){const p=products.find(p=>p.id===item.productId);p.stock-=item.quantity;stockLog(p,-item.quantity,'sale',sale.invoiceNumber);}sales.unshift(sale);return copy(sale);
    }
    if(path.startsWith('/sales/')){const sale=sales.find(s=>s.id===path.split('/')[2]);if(!sale)fail('Sale not found.',404);if(method==='post'&&path.endsWith('/payments')){const amount=money(number(input.amount,'Payment',0.01));if(amount>sale.due)fail('Payment exceeds outstanding due.');sale.amountPaid=money(sale.amountPaid+amount);sale.due=money(sale.due-amount);sale.payments=[...(sale.payments||[]),{amount,createdAt:now()}];return copy(sale);}if(method==='get')return copy(sale);}
    if(path==='/dashboard/monthly')return monthlyAnalytics({products,sales,month:query.month,currency:settings.business.currency});
    if(path==='/dashboard/stats')return copy(stats(query.dateFilter));
    if(path==='/dashboard/recent-sales'){const {start}=period(query.dateFilter);return copy(sales.filter(s=>new Date(s.createdAt)>=start).slice(0,Number(query.limit)||5).map(s=>({id:s.id,invoiceNumber:s.invoiceNumber,customer:s.customerName,amount:s.total,date:s.createdAt})));}
    if(path==='/dashboard/notifications'){const notifications=settings.preferences.lowStockAlerts?products.filter(p=>p.stock<=p.lowStockThreshold).map(p=>({id:p.id,product:p.name,stock:p.stock,threshold:p.lowStockThreshold,severity:p.stock===0?'critical':'warning',message:`${p.name}: ${p.stock} in stock` })):[];return {notifications,alertsEnabled:settings.preferences.lowStockAlerts,lowStockCount:notifications.length,outOfStockCount:products.filter(p=>p.stock===0).length,status:notifications.length?'active':'empty'};}
    if(path==='/dashboard/sales-overview'){const today=clock();const monthly=query.range!=='This Month'&&query.range!=='Last 30 Days';const bins=Array.from({length:monthly?12:10},(_,i)=>({month:monthly?new Date(today.getFullYear(),i,1).toLocaleString('en',{month:'short'}):`${i*3+1}–${i*3+3}`,sales:0}));for(const sale of sales){const date=new Date(sale.createdAt);const days=Math.floor((today-date)/86400000);const index=monthly?(date.getFullYear()===today.getFullYear()?date.getMonth():-1):days>=0&&days<30?9-Math.floor(days/3):-1;if(index>=0)bins[index].sales=money(bins[index].sales+sale.total);}return bins;}
    if(path==='/ai/insights')return copy(insights(query));
    if(path==='/chat') {const s=stats('All Time');const low=products.filter(p=>p.stock<=p.lowStockThreshold).map(p=>`${p.name} (${p.stock})`).join(', ');return {reply:`Browser demo summary (calculated locally, not a Groq response): ${s.totalProducts} products, ${s.totalSales} sales, revenue ${settings.business.currency} ${s.totalRevenue}, outstanding dues ${settings.business.currency} ${s.totalDue}. Low stock: ${low||'none'}. Refresh resets demo changes.`,configured:true,context:{sandbox:true}};}
    fail('This operation is not available in the browser demo.',405);
  }
  return { handle, snapshot: () => copy({ totals: stats('All Time'), today: stats('Today'), thisMonth: stats('This Month'), currency: settings.business.currency, allowDues: settings.preferences.allowDues, products: products.map(p=>({ name:p.name,sku:p.sku,stock:p.stock,price:p.price,threshold:p.lowStockThreshold })), insights: insights() }) };
}
