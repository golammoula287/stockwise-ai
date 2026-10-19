import { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { formatCount } from '../lib/formatters';

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
  const [notifState, setNotifState] = useState({
    alertsEnabled: true,
    status: 'loading',
    message: '',
    lowStockCount: 0,
    outOfStockCount: 0,
    notifications: [],
  });

  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    api
      .get('/dashboard/notifications')
      .then(res => {
        if (!active) return;
        const payload = res.data;
        if (Array.isArray(payload)) {
          setNotifState({
            alertsEnabled: true,
            status: payload.length === 0 ? 'empty' : 'active',
            message:
              payload.length === 0
                ? 'All products are well stocked.'
                : `${formatCount(payload.length, 'low-stock alert')} active.`,
            lowStockCount: payload.length,
            outOfStockCount: payload.filter(n => n.severity === 'critical').length,
            notifications: payload,
          });
        } else {
          const list = Array.isArray(payload?.notifications) ? payload.notifications : [];
          const alertsEnabled = payload?.alertsEnabled !== false;
          const status =
            payload?.status || (!alertsEnabled ? 'disabled' : list.length === 0 ? 'empty' : 'active');
          const message =
            payload?.message ||
            (!alertsEnabled
              ? 'Low-stock notifications are disabled in Preferences.'
              : list.length === 0
              ? 'All products are well stocked.'
              : `${formatCount(list.length, 'low-stock alert')} active.`);

          setNotifState({
            alertsEnabled,
            status,
            message,
            lowStockCount: Number(payload?.lowStockCount ?? list.length),
            outOfStockCount: Number(payload?.outOfStockCount ?? 0),
            notifications: list,
          });
        }
      })
      .catch(() => {
        if (!active) return;
        setNotifState({
          alertsEnabled: true,
          status: 'error',
          message: 'Unable to load notifications. Please try again.',
          lowStockCount: 0,
          outOfStockCount: 0,
          notifications: [],
        });
      });

    return () => {
      active = false;
    };
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const activeAlerts = notifState.notifications;

  return (
    <div className="min-h-screen flex bg-[#f4f7fb] text-slate-800">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[225px] bg-[#111827] text-white flex-col shrink-0 select-none">
        <div className="px-5 py-5 flex items-center gap-2.5 font-bold text-lg tracking-tight border-b border-white/10">
          <span className="bg-blue-600 w-7 h-7 rounded-lg grid place-items-center text-sm shadow">⬢</span>
          <span>StockWise AI</span>
        </div>
        <nav className="px-3 py-4 space-y-1.5 flex-1" aria-label="Primary Sidebar Navigation">
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
              <button
                onClick={() => setMobileOpen(false)}
                className="text-slate-400 hover:text-white text-lg"
                aria-label="Close navigation menu"
              >
                ✕
              </button>
            </div>
            <nav className="px-3 py-4 space-y-1.5 flex-1" aria-label="Mobile Navigation">
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
            {/* Low-Stock Notification Bell (IMP-18) */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="relative p-2 rounded-full hover:bg-slate-100 text-slate-600 transition"
                aria-label="Notifications"
                aria-expanded={notifOpen}
              >
                <span className="text-lg">🔔</span>
                {notifState.alertsEnabled && activeAlerts.length > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
                    {activeAlerts.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-50">
                  <div className="flex items-center justify-between pb-2 border-b">
                    <span className="font-semibold text-sm">Low-Stock Alerts</span>
                    <span className="text-xs text-slate-500">
                      {notifState.status === 'disabled'
                        ? 'Disabled'
                        : notifState.status === 'error'
                        ? 'Unavailable'
                        : `${activeAlerts.length} active`}
                    </span>
                  </div>
                  <div className="max-h-64 overflow-auto divide-y divide-slate-100 mt-1">
                    {notifState.status === 'disabled' && (
                      <div className="py-5 px-2 text-center space-y-1.5">
                        <div className="text-xs font-medium text-slate-700">
                          Low-stock notifications are disabled in Preferences.
                        </div>
                        {notifState.lowStockCount > 0 && (
                          <div className="text-[11px] text-amber-700">
                            ({formatCount(notifState.lowStockCount, 'product is', 'products are')} currently at or below threshold.)
                          </div>
                        )}
                        <Link
                          to="/settings"
                          className="inline-block text-[11px] font-semibold text-blue-600 hover:underline"
                        >
                          Manage in Settings → Preferences
                        </Link>
                      </div>
                    )}

                    {notifState.status === 'error' && (
                      <div className="py-5 px-2 text-center text-xs text-red-600">
                        {notifState.message || 'Unable to load notifications.'}
                      </div>
                    )}

                    {notifState.status === 'empty' && (
                      <div className="py-6 text-center text-xs text-slate-400">
                        All products are well stocked.
                      </div>
                    )}

                    {notifState.status === 'active' &&
                      activeAlerts.map(n => (
                        <div key={n.id} className="py-2.5 flex items-start gap-2.5 text-xs">
                          <span
                            className={`px-1.5 py-0.5 rounded font-semibold ${
                              n.severity === 'critical'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {n.severity === 'critical' ? 'OUT' : 'LOW'}
                          </span>
                          <div className="flex-1">
                            <div className="font-medium text-slate-800">{n.product}</div>
                            <div className="text-slate-500">{n.message}</div>
                          </div>
                        </div>
                      ))}
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
