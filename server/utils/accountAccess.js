async function assertAccountAccess(prisma, user) {
  const unavailable = () => Object.assign(new Error('This account is unavailable. Contact your administrator.'), { status: 401 });
  if (!user || user.isActive === false) throw unavailable();
  if (user.adminId) {
    const admin = await prisma.user.findUnique({ where: { id: user.adminId } });
    if (user.role !== 'staff' || !admin || admin.isActive === false || admin.role !== 'admin' || admin.adminId || admin.privateWorkspace !== true || user.privateWorkspace !== true) throw unavailable();
  }
}

module.exports = { assertAccountAccess };
