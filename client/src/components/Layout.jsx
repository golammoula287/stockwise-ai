import { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '◧' },
  { to: '/products', label: 'Products', icon: '📦' },
  { to: '/sales', label: 'Sales', icon: '🛒' },
  { to: '/customers', label: 'Customers', icon: '👥' },
  { to: '/ai-insights', label: 'AI Insights', icon: '✦' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    api.get('/dashboard/notifications')
      .then(res => setNotifications(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-[#f4f7fb] text-slate-800">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[225px] bg-[#111827] text-white flex-col shrink-0 select-none">
        <div className="px-5 py-5 flex items-center gap-2.5 font-bold text-lg tracking-tight border-b border-white/10">
          <span className="bg-blue-600 w-7 h-7 rounded-lg grid place-items-center text-sm shadow">⬢</span>
          <span>StockWise AI</span>
        </div>
        <nav className="px-3 py-4 space-y-1.5 flex-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white text-sm font-medium transition"
          >
            <span>↪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-[#111827] text-white flex flex-col z-10">
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2 font-bold text-lg">
                <span className="bg-blue-600 w-7 h-7 rounded-lg grid place-items-center text-sm">⬢</span>
                <span>StockWise AI</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>
            <nav className="px-3 py-4 space-y-1.5 flex-1">
              {navItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                      isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10'
                    }`
                  }
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="p-3 border-t border-white/10">
              <button
                onClick={handleLogout}
                className="w-full text-left px-3.5 py-2.5 text-slate-300 hover:text-white text-sm font-medium"
              >
                ↪ Logout
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200/80 flex items-center justify-between px-4 md:px-7 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              aria-label="Open navigation menu"
            >
              ☰
            </button>
            <div className="md:hidden font-bold flex items-center gap-2">
              <span className="bg-blue-600 text-white w-6 h-6 rounded grid place-items-center text-xs">⬢</span>
              <span>StockWise AI</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Low-Stock Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="relative p-2 rounded-full hover:bg-slate-100 text-slate-600 transition"
                aria-label="Notifications"
              >
                <span className="text-lg">🔔</span>
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
                    {notifications.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-50">
                  <div className="flex items-center justify-between pb-2 border-b">
                    <span className="font-semibold text-sm">Low-Stock Alerts</span>
                    <span className="text-xs text-slate-500">{notifications.length} active</span>
                  </div>
                  <div className="max-h-64 overflow-auto divide-y divide-slate-100 mt-1">
                    {notifications.map(n => (
                      <div key={n.id} className="py-2.5 flex items-start gap-2.5 text-xs">
                        <span className={`px-1.5 py-0.5 rounded font-semibold ${n.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {n.severity === 'critical' ? 'OUT' : 'LOW'}
                        </span>
                        <div className="flex-1">
                          <div className="font-medium text-slate-800">{n.product}</div>
                          <div className="text-slate-500">{n.message}</div>
                        </div>
                      </div>
                    ))}
                    {notifications.length === 0 && (
                      <div className="py-6 text-center text-xs text-slate-400">All products are well stocked</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Pill */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white grid place-items-center font-bold text-sm shadow-sm">
                {(user?.name || 'John Doe')[0].toUpperCase()}
              </div>
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="text-sm font-semibold text-slate-800">{user?.name || 'John Doe'}</span>
                <span className="text-xs text-slate-500 capitalize">{user?.role || 'Admin'}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-7 max-w-[1400px] w-full mx-auto flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
