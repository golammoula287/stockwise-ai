const express=require('express');
const request=require('supertest');
let mockUser;
const mockPrisma={user:{findMany:jest.fn(),count:jest.fn(),findUnique:jest.fn(),create:jest.fn(),update:jest.fn(),delete:jest.fn()}};
jest.mock('../middleware/auth',()=>({protect:(req,res,next)=>{req.user=mockUser;next();}}));
jest.mock('../config/db',()=>({getPrisma:()=>mockPrisma,isValidId:id=>id==='target-id'||id==='owner-id'}));
const app=express();app.use(express.json());app.use('/users',require('../routes/users'));app.use((err,req,res,next)=>res.status(500).json({message:'Test error'}));
beforeEach(()=>{process.env.SUPER_ADMIN_EMAIL='owner@example.com';mockUser={id:'owner-id',email:'owner@example.com',role:'admin'};jest.clearAllMocks();mockPrisma.user.findUnique.mockResolvedValue({id:'target-id',name:'Visitor',email:'visitor@example.com',role:'staff'});});
test('anonymous, staff, and ordinary admins cannot list or mutate users',async()=>{
 for(const user of [undefined,{id:'staff',email:'owner@example.com',role:'staff'},{id:'admin',email:'other@example.com',role:'admin'}]){mockUser=user;for(const method of ['get','post','delete']){const r=await request(app)[method](method==='delete'?'/users/target-id':'/users').send({});expect([401,403]).toContain(r.status);}}
 expect(mockPrisma.user.findMany).not.toHaveBeenCalled();expect(mockPrisma.user.delete).not.toHaveBeenCalled();
});
test('owner search uses safe projection and pagination',async()=>{
 mockPrisma.user.findMany.mockResolvedValue([{id:'target-id',name:'Visitor',email:'visitor@example.com',role:'staff'}]);mockPrisma.user.count.mockResolvedValue(1);
 const r=await request(app).get('/users?search=visitor&page=2');expect(r.status).toBe(200);expect(r.body.users[0].password).toBeUndefined();expect(mockPrisma.user.findMany.mock.calls[0][0]).toMatchObject({skip:50,take:50,select:{id:true,name:true,email:true,role:true,createdAt:true}});
});
test('cannot delete or demote the owner and cannot assign super-admin roles',async()=>{
 mockPrisma.user.findUnique.mockResolvedValue(mockUser);
 expect((await request(app).delete('/users/owner-id')).status).toBe(403);
 expect((await request(app).patch('/users/owner-id').send({name:'Owner',role:'staff'})).status).toBe(403);
 expect((await request(app).post('/users').send({name:'Invalid',email:'new@example.com',role:'super_admin',password:'SomePrivatePassword123'})).status).toBe(400);
 expect(mockPrisma.user.delete).not.toHaveBeenCalled();expect(mockPrisma.user.update).not.toHaveBeenCalled();
});
test('create hashes password, fixes fields and returns no secret',async()=>{
 mockPrisma.user.create.mockResolvedValue({id:'target-id',name:'New user',role:'staff',email:'new@example.com'});
 const r=await request(app).post('/users').send({name:'New user',email:'NEW@example.com',password:'SomePrivatePassword123',role:'staff',isSuperAdmin:true});
 expect(r.status).toBe(201);expect(r.body.password).toBeUndefined();const saved=mockPrisma.user.create.mock.calls[0][0].data;expect(saved.email).toBe('new@example.com');expect(saved.password).toMatch(/^\$2/);expect(saved.isSuperAdmin).toBeUndefined();
});
test('historical records block deletion; name and role edits whitelist input',async()=>{
 mockPrisma.user.delete.mockRejectedValue({code:'P2003'});expect((await request(app).delete('/users/target-id')).status).toBe(409);
 mockPrisma.user.update.mockResolvedValue({id:'target-id',name:'Updated',role:'admin'});
 expect((await request(app).patch('/users/target-id').send({name:'Updated',role:'admin',email:'owner@example.com',password:'ignored'})).status).toBe(200);
 expect(mockPrisma.user.update.mock.calls[0][0].data).toEqual({name:'Updated',role:'admin'});
});
