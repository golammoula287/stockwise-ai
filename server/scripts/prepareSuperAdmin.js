require('dotenv').config();
const bcrypt=require('bcryptjs');
const {getPrisma,disconnectDB}=require('../config/db');
async function run(){
 const email=(process.env.SUPER_ADMIN_EMAIL||'').trim().toLowerCase(),password=process.env.SUPER_ADMIN_PASSWORD||'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||Buffer.byteLength(password,'utf8')>72)throw Error('Configure a valid SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (12–72 bytes).');
 const prisma=getPrisma();const hash=await bcrypt.hash(password,12);
 await prisma.user.upsert({where:{email},create:{email,name:'Workspace Owner',password:hash,role:'admin',privateWorkspace:false},update:{password:hash,role:'admin',privateWorkspace:false}});
 console.log('Super admin account prepared. Credentials remain private.');
}
if(require.main===module)run().catch(()=>{console.error('Super admin preparation failed. Check private environment configuration and database access.');process.exitCode=1;}).finally(disconnectDB);
module.exports={run};
