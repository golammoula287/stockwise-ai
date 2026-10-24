import test from 'node:test';
import assert from 'node:assert/strict';
import { insightsCSV, insightSections } from '../src/lib/insightsReport.mjs';
import { createDemoStore } from '../src/lib/demoStore.js';
const options={currency:'USD',sandbox:true,generatedAt:'2026-10-23T19:00:00Z'};
test('insights export includes complete sections, currency and absent probability without inventing validation',()=>{
 const sections=insightSections({recommendations:[{product:'Product',estimatedCost:12.34}],topProducts:[],slowMoving:[]},options);
 assert.equal(sections.length,5);
 assert.equal(sections[1].rows[0][11],'Not available');
 assert.ok(sections[0].rows.some(r=>r[0]==='Currency'&&r[1]==='USD'));
 assert.match(sections[4].rows[0][1],/No model validation/);
});
test('CSV quotes user text and neutralizes spreadsheet formulas; dates use Bangladesh time',()=>{
 const csv=insightsCSV({summary:'=SUM(1,2)',topProducts:[{name:'Mouse, "Blue"\nEdition',sold:2,revenue:35}]},options);
 assert.match(csv,/"'=SUM\(1,2\)"/);
 assert.match(csv,/"Mouse, ""Blue""\nEdition"/);
 assert.match(csv,/24 Oct 2026/);
 assert.match(csv,/Product sales/);
});
test('sandbox insights identify idle inventory without fabricated validation',()=>{
 const store=createDemoStore({id:'insight-test'});
 store.handle('post','/products',{name:'Idle product',sku:'IDLE',category:'Test',price:20,cost:10,stock:5,lowStockThreshold:1});
 const report=store.handle('get','/ai/insights');
 assert.equal(report.slowMoving.find(p=>p.product==='Idle product').tiedCapital,50);
 assert.equal(report.modelEvaluation,null);
 assert.ok(report.generatedAt);
 assert.ok(report.topProducts.every(p=>p.sold>0));
});
