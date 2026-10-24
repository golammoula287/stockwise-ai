import test from 'node:test';
import assert from 'node:assert/strict';
import { salesPeriod, fetchSalesReport } from '../../shared/salesPeriod.mjs';
import { createDemoStore } from '../src/lib/demoStore.js';
test('month uses Bangladesh midnight and leap-year boundaries',()=>{
 const p=salesPeriod({month:'2024-02'});
 assert.equal(new Date(p.start).toISOString(),'2024-01-31T18:00:00.000Z');
 assert.equal(new Date(p.end).toISOString(),'2024-02-29T18:00:00.000Z');
});
test('date range includes the entire end day and rejects invalid selections',()=>{
 const p=salesPeriod({startDate:'2026-10-24',endDate:'2026-10-24'});
 assert.equal(p.end-p.start,86400000);
 for(const q of [{month:'2026-13'},{startDate:'2026-02-30',endDate:'2026-03-01'},{startDate:'2026-10-25',endDate:'2026-10-24'},{startDate:'2026-10-24'},{month:'2026-10',endDate:'2026-10-24'}]) assert.throws(()=>salesPeriod(q));
});
test('report retrieves all pages with unchanged selection and propagates failures',async()=>{
 const calls=[];
 const rows=await fetchSalesReport(async(path,{params})=>{calls.push(params);return {data:{sales:[params.page],pages:3}};},{month:'2026-10',search:'Alice'});
 assert.deepEqual(rows,[1,2,3]);
 assert.ok(calls.every(p=>p.month==='2026-10'&&p.search==='Alice'&&p.limit===200));
 await assert.rejects(fetchSalesReport(async()=>{throw Error('offline');},{}),/offline/);
});
test('sandbox date filters and pagination match report selection',()=>{
 const store=createDemoStore({id:'report-test'});
 const all=store.handle('get','/sales',{}, {limit:1000});
 const first=all.sales[0];
 // Derive via boundary timestamps, independent of the host time zone.
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit'}).formatToParts(new Date(first.createdAt));
 const key=parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
 const p=salesPeriod({month:key});
 const result=store.handle('get','/sales',{}, {month:key,limit:1});
 assert.equal(result.total,all.sales.filter(s=>Date.parse(s.createdAt)>=p.start&&Date.parse(s.createdAt)<p.end).length);
 assert.equal(result.sales.length,1);
 assert.equal(store.handle('get','/sales',{}, {month:'2000-01'}).total,0);
});
