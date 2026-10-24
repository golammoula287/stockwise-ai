import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoStore } from '../src/lib/demoStore.js';
const create=()=>createDemoStore({id:'test',name:'Test Visitor',role:'staff'});
test('new demo categories appear empty, support products and filters, and reset with the demo', () => {
 const store=create();
 assert.equal(store.handle('post','/products/categories',{name:'  Home   Goods  '}).category,'Home Goods');
 assert.equal(store.handle('get','/products/categories').find(c=>c.category==='Home Goods').count,0);
 assert.throws(()=>store.handle('post','/products/categories',{name:'HOME GOODS'}),/already exists/);
 assert.throws(()=>store.handle('post','/products/categories',{name:'All Categories'}),/Choose/);
 assert.throws(()=>store.handle('post','/products/categories',{name:'   '}),/1–60/);
 store.handle('post','/products',{name:'Lamp',category:'Home Goods',price:100,cost:50,stock:2});
 assert.equal(store.handle('get','/products',{}, {category:'Home Goods'}).total,1);
 assert.equal(store.handle('get','/products/categories').find(c=>c.category==='Home Goods').count,1);
 assert.equal(create().handle('get','/products/categories').some(c=>c.category==='Home Goods'),false);
});
test('no dues by default; failed checkout is atomic and totals are recomputed',()=>{
 const store=create();const initial=store.handle('get','/products',{}, {limit:200});const p=initial.products[0];
 assert.throws(()=>store.handle('post','/sales',{items:[{product:p.id,quantity:1}],amountPaid:1}),/full payment/);
 assert.equal(store.handle('get',`/products/${p.id}`).stock,p.stock);
 const sale=store.handle('post','/sales',{items:[{product:p.id,quantity:1}],total:1});assert.equal(sale.total,p.price);assert.equal(sale.due,0);
 assert.equal(store.handle('get',`/products/${p.id}`).stock,p.stock-1);
});
test('duplicate cart lines cannot oversell or partially alter stock',()=>{
 const store=create(),p=store.handle('get','/products').products[0];
 assert.throws(()=>store.handle('post','/sales',{items:[{product:p.id,quantity:p.stock},{product:p.id,quantity:1}]}),/stock/);
 assert.equal(store.handle('get',`/products/${p.id}`).stock,p.stock);
});
test('dues require customer, collect correctly, block disabling with balances',()=>{
 const store=create();store.handle('put','/settings',{preferences:{allowDues:true}});const p=store.handle('get','/products').products[0];
 assert.throws(()=>store.handle('post','/sales',{items:[{product:p.id,quantity:1}],amountPaid:0}),/saved customer/);
 const customer=store.handle('get','/customers')[0];const sale=store.handle('post','/sales',{items:[{product:p.id,quantity:1}],amountPaid:100,customer:customer.id});
 assert.equal(sale.due,p.price-100);assert.throws(()=>store.handle('put','/settings',{preferences:{allowDues:false}}),/outstanding/);
 assert.throws(()=>store.handle('post',`/sales/${sale.id}/payments`,{amount:sale.due+1}),/exceeds/);
 const paid=store.handle('post',`/sales/${sale.id}/payments`,{amount:sale.due});assert.equal(paid.due,0);assert.equal(paid.amountPaid,sale.total);
 store.handle('put','/settings',{preferences:{allowDues:false}});
});
test('required custom fields validate, save and reset with a new store',()=>{
 const store=create();store.handle('put','/settings',{preferences:{productFields:[{id:'size',label:'Size',type:'select',required:true,options:['S','M']}]}});
 const product={name:'Shirt',category:'Clothing',sku:'SHIRT-1',price:500,cost:200,stock:10};
 assert.throws(()=>store.handle('post','/products',product),/Size is required/);
 assert.throws(()=>store.handle('post','/products',{...product,customFields:{size:'XL'}}),/Size is invalid/);
 const result=store.handle('post','/products',{...product,customFields:{size:'M'}});assert.equal(result.customFields.size,'M');
 assert.equal(create().handle('get','/settings').preferences.productFields.length,0);
 assert.equal(create().handle('get','/products',{}, {search:'SHIRT-1'}).total,0);
});
test('stock changes affect dashboard and low stock recommendations',()=>{
 const store=create(),p=store.handle('get','/products').products[0];
 store.handle('patch',`/products/${p.id}/stock`,{delta:-p.stock});
 assert.ok(store.handle('get','/ai/insights').recommendations.some(r=>r.productId===p.id));
 const stats=store.handle('get','/dashboard/stats',{}, {dateFilter:'All Time'});
 const customer=store.handle('get','/customers')[0],other=store.handle('get','/products').products[1];
 store.handle('post','/sales',{customer:customer.id,items:[{product:other.id,quantity:1}]});
 assert.equal(store.handle('get','/dashboard/stats',{}, {dateFilter:'All Time'}).totalRevenue,stats.totalRevenue+other.price);
});
test('history search matches invoice/customer/phone and stock product/SKU without case sensitivity',()=>{
 const store=create();
 assert.equal(store.handle('get','/sales',{}, {search:'demo-1001'}).total,1);
 assert.ok(store.handle('get','/sales',{}, {search:'nusrat'}).total>0);
 assert.ok(store.handle('get','/sales',{}, {search:'01700000001'}).total>0);
 const product=store.handle('get','/products').products[0];
 store.handle('patch',`/products/${product.id}/stock`,{delta:3});
 assert.equal(store.handle('get','/products/stock-history',{}, {search:'laptop'}).length,1);
 assert.equal(store.handle('get','/products/stock-history',{}, {search:'sw-001'})[0].sku,'SW-001');
 assert.equal(store.handle('get','/products/stock-history',{}, {search:'missing'}).length,0);
});
test('demo history spans six months with varied baskets and reconciled financials',()=>{
 const store=create();const sales=store.handle('get','/sales',{}, {limit:1000}).sales;
 assert.equal(sales.length,360);
 assert.equal(new Set(sales.map(s=>s.invoiceNumber)).size,sales.length);
 assert.ok(Date.now()-Date.parse(sales.at(-1).createdAt)>178*86400000);
 assert.ok(sales.some(s=>s.items.length>1));assert.ok(sales.some(s=>s.discount>0));
 assert.equal(new Set(sales.map(s=>s.paymentMethod)).size,3);
 for(const sale of sales){assert.equal(sale.total,Math.round((sale.subtotal-sale.discount)*100)/100);assert.equal(sale.amountPaid,sale.total);assert.equal(sale.due,0);assert.ok(Date.parse(sale.createdAt)<=Date.now());}
 const report=store.handle('get','/ai/insights');assert.ok(report.slowMoving.length>=2);assert.ok(report.topProducts.length>=8);
});
test('rolling demo stays recent across future years, leap day and Bangladesh midnight',()=>{
 for(const instant of ['2027-01-01T00:05:00Z','2028-02-29T18:01:00Z','2035-07-15T12:00:00Z','2050-12-31T23:59:00Z']) {
  const clock=()=>new Date(instant);
  const store=createDemoStore({id:'future-demo'},{clock});
  const sales=store.handle('get','/sales',{}, {limit:1000}).sales;
  assert.equal(sales.length,360);
  assert.ok(sales.every(s=>Date.parse(s.createdAt)<=clock().getTime()));
  assert.ok(clock().getTime()-Date.parse(sales[0].createdAt)<86400000);
  const short=store.handle('get','/ai/insights',{}, {days:7});
  const long=store.handle('get','/ai/insights',{}, {days:90});
  assert.ok(short.topProducts.length>0);assert.ok(short.revenueThisMonth>0);
  assert.ok(long.revenueThisMonth>short.revenueThisMonth);
  const products=store.handle('get','/products',{}, {limit:100}).products;
  assert.ok(products.every(p=>Date.parse(p.createdAt)<=Date.parse(sales.at(-1).createdAt)));
 }
});
