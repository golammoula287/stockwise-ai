const express = require('express');
const request = require('supertest');
jest.mock('../middleware/auth', () => ({ protect: (req,res,next)=>next(), adminOnly: (req,res,next)=>next() }));
jest.mock('../config/db', () => ({ getPrisma: () => mockPrisma, isValidId: () => true, computeProductStatus: product => product }));
const mockPrisma = { stockLog: { findMany: jest.fn() }, product: { findMany: jest.fn() } };
const app = express();app.use('/products',require('../routes/products'));
afterEach(()=>jest.clearAllMocks());
test('stock history searches product name and SKU in database, returns SKU labels',async()=>{
 mockPrisma.stockLog.findMany.mockResolvedValue([{id:'log-1',productId:'p-1',productName:'Laptop'}]);
 mockPrisma.product.findMany.mockResolvedValue([{id:'p-1',sku:'SW-001'}]);
 const result=await request(app).get('/products/stock-history').query({search:'sw-001',limit:200});
 expect(result.status).toBe(200);expect(result.body[0].sku).toBe('SW-001');
 expect(mockPrisma.stockLog.findMany.mock.calls[0][0]).toMatchObject({take:200,where:{OR:[{productName:{contains:'sw-001',mode:'insensitive'}},{product:{sku:{contains:'sw-001',mode:'insensitive'}}}]}});
});
test('empty stock matches skip the product enrichment query',async()=>{
 mockPrisma.stockLog.findMany.mockResolvedValue([]);
 const result=await request(app).get('/products/stock-history').query({search:'not-found'});
 expect(result.body).toEqual([]);expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
});
