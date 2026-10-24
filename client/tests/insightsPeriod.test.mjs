import test from 'node:test';
import assert from 'node:assert/strict';
import { insightsPeriod } from '../../shared/insightsPeriod.mjs';
import { createDemoStore } from '../src/lib/demoStore.js';
const now=new Date('2026-10-24T08:00:00Z');
test('insight periods use Bangladesh dates, cap open month at today, and validate limits',()=>{
 const p=insightsPeriod({days:7},now);
 assert.equal(p.startDate,'2026-10-18');assert.equal(p.endDate,'2026-10-24');assert.equal(p.days,7);
 const month=insightsPeriod({month:'2026-10'},now);assert.equal(month.days,24);
 assert.equal(insightsPeriod({month:'2024-02'},now).days,29);
 assert.throws(()=>insightsPeriod({days:12},now));
 assert.throws(()=>insightsPeriod({month:'2027-01'},now));
 assert.throws(()=>insightsPeriod({startDate:'2020-01-01',endDate:'2026-10-01'},now));
});
test('sandbox selected periods change revenue, product sales and demand estimates together',()=>{
 const store=createDemoStore({id:'period-test'});
 const short=store.handle('get','/ai/insights',{}, {days:7});
 const long=store.handle('get','/ai/insights',{}, {days:30});
 assert.equal(short.period.days,7);assert.ok(short.revenueThisMonth<long.revenueThisMonth);
 const old=store.handle('get','/ai/insights',{}, {month:'2000-01'});
 assert.equal(old.revenueThisMonth,0);assert.equal(old.topProducts.length,0);assert.ok(old.slowMoving.length>0);
});
test('server insights apply selected window to database queries with current inventory',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const calls=[];
 const dbPath=require.resolve('../../server/config/db.js');
 const previous=require.cache[dbPath];
 require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{getPrisma:()=>({product:{findMany:async()=>[]},sale:{findMany:async query=>{calls.push(query);return [];}},setting:{findFirst:async()=>({})}})}};
 try {
 const {generateInsights}=require('../../server/utils/aiInsights.js');
 const report=await generateInsights({month:'2024-02'});
 assert.equal(report.period.days,29);
 assert.equal(calls[2].where.createdAt.gte.toISOString(),'2024-01-31T18:00:00.000Z');
 assert.equal(calls[2].where.createdAt.lte.toISOString(),'2024-02-29T17:59:59.999Z');
 assert.equal(report.revenueThisMonth,0);
 } finally {if(previous)require.cache[dbPath]=previous;else delete require.cache[dbPath];}
});
