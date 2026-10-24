export function accountHome(user) {
  return user?.isSuperAdmin === true ? '/management' : '/dashboard';
}
