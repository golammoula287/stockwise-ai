function isSuperAdmin(user) {
  const email=(process.env.SUPER_ADMIN_EMAIL||'').trim().toLowerCase();
  return Boolean(email && user?.role==='admin' && user.email?.toLowerCase()===email);
}
function superAdminOnly(req,res,next) {
  if(!req.user)return res.status(401).json({message:'Sign in to continue.'});
  if(!isSuperAdmin(req.user))return res.status(403).json({message:'Super admin access required.'});
  next();
}
module.exports={isSuperAdmin,superAdminOnly};
