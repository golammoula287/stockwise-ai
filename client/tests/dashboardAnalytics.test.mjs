import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyAnalytics, monthKeys } from '../../shared/dashboardAnalytics.mjs';
const sale=(createdAt,total,extra={})=>({createdAt,total,profit:total/4,amountPaid:total,due:0,items:[],...extra});
test('selected and previous calendar months use Bangladesh date boundaries',()=>{
 const data=monthlyAnalytics({month:'2026-02',sales:[sale('2026-01-31T18:00:00Z',100),sale('2026-01-31T17:59:59Z',40),sale('2026-02-28T18:00:00Z',900)]});
 assert.equal(data.current.revenue,100);assert.equal(data.previous.revenue,40);assert.equal(data.current.orders,1);assert.equal(data.changes.revenue,150);assert.equal(data.points[0].current,100);
});
test('unequal months, leap years and January rollover are aligned correctly',()=>{
 assert.equal(monthKeys('2024-03').previousDays,29);assert.equal(monthKeys('2026-01').previousMonth,'2025-12');
 const data=monthlyAnalytics({month:'2026-02',sales:[]});assert.equal(data.points.length,31);assert.equal(data.points[28].current,null);assert.equal(data.current.revenue,0);assert.equal(data.changes.revenue,null);
 assert.throws(()=>monthKeys('2026-13'));assert.throws(()=>monthKeys('invalid'));
});
test('dues card covers all invoices; payment chart covers selected invoices only',()=>{
 const data=monthlyAnalytics({month:'2026-02',sales:[sale('2026-02-04',100,{amountPaid:60,due:40}),sale('2025-12-03',80,{amountPaid:30,due:50})]});
 assert.deepEqual(data.payments,{collected:60,due:40,allTimeDue:90,unpaidInvoices:2});
 assert.equal(data.current.profit,25);assert.equal(data.current.averageOrder,100);
});
test('product ranking and totals retain decimal accuracy without changing inputs',()=>{
 const sales=[sale('2026-02-03',0.1,{items:[{productId:'a',name:'A',quantity:1,subtotal:0.1}]}),sale('2026-02-04',0.2,{items:[{productId:'a',name:'A',quantity:2,subtotal:0.2}]})];
 const original=JSON.stringify(sales);const data=monthlyAnalytics({month:'2026-02',sales});assert.equal(data.current.revenue,0.3);assert.equal(data.topProducts[0].revenue,0.3);assert.equal(data.topProducts[0].quantity,3);assert.equal(JSON.stringify(sales),original);
});
