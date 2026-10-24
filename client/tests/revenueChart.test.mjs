import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRevenueChart } from '../src/lib/revenueChart.js';
test('cumulative chart keeps future and missing days blank without rounding drift',()=>{
 const points=[{day:1,current:0.1,previous:0.2},{day:2,current:0.2,previous:0.3},{day:3,current:null,previous:1},{day:4,current:null,previous:null}];
 const result=prepareRevenueChart(points);
 assert.equal(result.cumulative[1].current,0.3);assert.equal(result.cumulative[1].previous,0.5);
 assert.equal(result.cumulative[2].current,null);assert.equal(result.cumulative[3].previous,null);
 assert.equal(points[1].current,0.2);
});
test('summary compares only matching available days instead of future previous-month sales',()=>{
 const result=prepareRevenueChart([{day:1,current:100,previous:50},{day:2,current:200,previous:50},{day:3,current:null,previous:900}]);
 assert.equal(result.selected,300);assert.equal(result.previous,100);assert.equal(result.difference,200);assert.equal(result.change,200);assert.equal(result.throughDay,2);
});
test('short previous months exclude unmatched days from comparable totals',()=>{
 const result=prepareRevenueChart([{day:28,current:10,previous:20},{day:29,current:40,previous:null}]);
 assert.equal(result.selected,10);assert.equal(result.previous,20);assert.equal(result.change,-50);assert.equal(result.throughDay,28);
});
test('zero baseline is not presented as invented percentage growth',()=>{
 assert.equal(prepareRevenueChart([{day:1,current:100,previous:0}]).change,null);
 assert.equal(prepareRevenueChart([{day:1,current:0,previous:0}]).hasRevenue,false);
 assert.equal(prepareRevenueChart([]).throughDay,0);
});
