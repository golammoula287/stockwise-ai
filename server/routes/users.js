const express=require('express');
const bcrypt=require('bcryptjs');
const {body,validationResult}=require('express-validator');
const {getPrisma,isValidId}=require('../config/db');
const {protect}=require('../middleware/auth');
const {superAdminOnly,isSuperAdmin}=require('../utils/superAdmin');
const {createRateLimiter}=require('../middleware/rateLimit');
const router=express.Router();
const select={id:true,name:true,email:true,role:true,createdAt:true};
router.use(protect,superAdminOnly,createRateLimiter({prefix:'user-management',windowMs:60000,max:60}));
router.get('/',async(req,res,next)=>{try{
 const search=String(req.query.search||'').trim().slice(0,100);
 const where=search?{OR:[{name:{contains:search,mode:'insensitive'}},{email:{contains:search,mode:'insensitive'}}]}:{};
 const page=Math.max(1,parseInt(req.query.page,10)||1),limit=50;
 const [users,total]=await Promise.all([getPrisma().user.findMany({where,select,orderBy:[{createdAt:'desc'},{id:'asc'}],take:limit,skip:(page-1)*limit}),getPrisma().user.count({where})]);
 res.json({users:users.map(user=>({...user,isSuperAdmin:isSuperAdmin(user)})),total,page,pages:Math.max(1,Math.ceil(total/limit))});
}catch(error){next(error);}});
const fields=[body('name').isString().trim().isLength({min:2,max:80}),body('role').isIn(['admin','staff'])];
router.post('/',[...fields,body('email').isEmail().isLength({max:254}),body('password').isString().isLength({min:12,max:72}).custom(value=>Buffer.byteLength(value,'utf8')<=72)],async(req,res,next)=>{try{
 if(!validationResult(req).isEmpty())return res.status(400).json({message:'Enter a valid name, email, role and a 12–72 character password.'});
 const email=req.body.email.toLowerCase().trim();
 if(email===(process.env.SUPER_ADMIN_EMAIL||'').toLowerCase().trim())return res.status(400).json({message:'The owner account is managed through server configuration.'});
 const password=await bcrypt.hash(req.body.password,12);
 const user=await getPrisma().user.create({data:{name:req.body.name,email,role:req.body.role,password},select});res.status(201).json(user);
}catch(error){if(error.code==='P2002')return res.status(409).json({message:'This email is already registered.'});next(error);}});
router.use('/:id',async(req,res,next)=>{try{
 if(!isValidId(req.params.id))return res.status(400).json({message:'Invalid user ID.'});
 const target=await getPrisma().user.findUnique({where:{id:req.params.id},select});
 if(!target)return res.status(404).json({message:'User not found.'});
 if(target.id===req.user.id || isSuperAdmin(target))return res.status(403).json({message:'The owner account cannot be changed or deleted here.'});
 next();
}catch(error){next(error);}});
router.patch('/:id',fields,async(req,res,next)=>{try{
 if(!validationResult(req).isEmpty())return res.status(400).json({message:'Enter a valid name and role.'});
 const user=await getPrisma().user.update({where:{id:req.params.id},data:{name:req.body.name,role:req.body.role},select});res.json(user);
}catch(error){next(error);}});
router.delete('/:id',async(req,res,next)=>{try{
 await getPrisma().user.delete({where:{id:req.params.id}});res.json({message:'User deleted. Existing login tokens for this account are no longer valid.'});
}catch(error){if(error.code==='P2003')return res.status(409).json({message:'This user has related business records and cannot be deleted.'});next(error);}});
module.exports=router;
