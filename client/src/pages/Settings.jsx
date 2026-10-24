import { useConfirm } from '../context/ConfirmContext';
import { isDemoSandbox } from '../lib/demoSandbox';
import BusinessModelSettings from '../components/BusinessModelSettings';
import AppearanceSettings from '../components/AppearanceSettings';
import { useDemoMode } from '../context/DemoModeContext';
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const demoReadOnly = useDemoMode();
  const confirm = useConfirm();
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState('Profile');
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [business, setBusiness] = useState({
    businessName: 'StockWise AI',
    currency: '৳',
    taxRate: 0,
    lowStockThresholdDefault: 5,
    businessAddress: '',
  });
  const [preferences, setPreferences] = useState({
    lowStockAlerts: true,
    emailReports: false,
    autoReorderSuggestions: true,
    dateFormat: 'MMM DD, YYYY',
  });
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    api
      .get('/settings')
      .then(res => {
        if (res.data.profile) {
          setProfile({
            name: res.data.profile.name || '',
            email: res.data.profile.email || '',
            phone: res.data.profile.phone || '',
          });
        }
        if (res.data.business) {
          setBusiness({
            businessName: res.data.business.name || 'StockWise AI',
            currency: res.data.business.currency || '৳',
            taxRate: res.data.business.taxRate ?? 0,
            lowStockThresholdDefault: res.data.business.lowStockThresholdDefault ?? 5,
            businessAddress: res.data.business.businessAddress || '',
          });
        }
        if (res.data.preferences) {
          setPreferences(res.data.preferences);
        }
        if (res.data.capabilities) {
          setSmtpConfigured(Boolean(res.data.capabilities.smtpConfigured));
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setMsg({ text: '', type: '' });
    if(!await confirm({title:'Save settings?',message:'Apply these business and preference settings? Changes affect checkout rules and how the workspace operates.',confirmLabel:'Save settings'}))return;
    setSubmitting(true);
    try {
      const { data } = await api.put('/settings', {
        ...profile,
        ...business,
        preferences,
      });
      if (data.user && setUser) {
        const updatedUser = { ...user, ...data.user };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
      }
      setMsg({ text: 'Settings saved successfully.', type: 'success' });
    } catch (e2) {
      setMsg({ text: e2.response?.data?.message || 'Failed to update settings', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setMsg({ text: '', type: '' });
    if (pw.newPassword !== pw.confirmPassword) {
      setMsg({ text: 'New password and confirmation do not match.', type: 'error' });
      return;
    }
    if (pw.newPassword === pw.currentPassword) {
      setMsg({ text: 'New password must be different from your current password.', type: 'error' });
      return;
    }
    if(!await confirm({title:'Change your password?',message:'Your sign-in password will change immediately. Use the new password the next time you sign in.',confirmLabel:'Change password'}))return;
    setSubmitting(true);
    try {
      const { data } = await api.put('/settings/password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      });
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      setMsg({ text: 'Password updated successfully.', type: 'success' });
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (e2) {
      setMsg({ text: e2.response?.data?.message || 'Password update failed', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-extrabold text-xl text-slate-900">Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">Manage your profile, security, and business configuration.</p>
      </div>

      {/* Card with Underline Tabs */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex gap-6 overflow-x-auto border-b border-slate-200 text-xs font-semibold">
          {(user?.role === 'staff' ? ['Profile', 'Business', 'Appearance'] : ['Profile', 'Business', 'Security', 'Preferences', 'Business model', 'Appearance']).map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setMsg({ text: '', type: '' });
              }}
              className={`pb-3 border-b-2 transition ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {msg.text && (
          <div
            role="alert"
            className={`p-3 rounded-xl text-xs font-medium ${
              msg.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {msg.text}
          </div>
        )}

        {tab === 'Appearance' && <AppearanceSettings />}
        {user?.role === 'staff' && tab !== 'Appearance' && <p className="text-sm text-slate-500">Your administrator manages passwords, inventory fields and business settings. These details are read-only.</p>}
        <fieldset disabled={user?.role === 'staff'} className="contents">
        {tab === 'Business model' && <BusinessModelSettings onSaved={setPreferences} />}

        {/* TAB 1: PROFILE */}
        {tab === 'Profile' && (
          <form onSubmit={handleSaveSettings} className="max-w-xl space-y-5">
            <h2 className="font-bold text-sm text-slate-900">Profile Information</h2>
            <div className="flex flex-col sm:flex-row gap-8 items-start">
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-blue-100 text-blue-600 grid place-items-center font-extrabold text-3xl">
                  {(profile.name || 'J')[0].toUpperCase()}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setMsg({ text: 'Avatar initials automatically sync with your profile name.', type: 'success' })
                  }
                  className="text-xs text-blue-600 font-semibold mt-2 hover:underline"
                >
                  Change Photo
                </button>
              </div>

              <div className="flex-1 w-full space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1 font-medium">Full Name</label>
                  <input
                    required
                    value={profile.name}
                    onChange={e => setProfile({ ...profile, name: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1 font-medium">Email Address</label>
                  <input
                    type="email"
                    required
                    value={profile.email}
                    onChange={e => setProfile({ ...profile, email: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1 font-medium">Phone Number</label>
                  <input
                    required
                    value={profile.phone}
                    onChange={e => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || demoReadOnly}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 font-semibold shadow-sm transition mt-2 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Update Profile'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* TAB 2: BUSINESS */}
        {tab === 'Business' && (
          <form onSubmit={handleSaveSettings} className="max-w-xl space-y-4 text-xs">
            <h2 className="font-bold text-sm text-slate-900">Business Configuration</h2>
            <p className="text-slate-500">
              These values apply across POS checkout tax calculation, currency formatting, and default product thresholds.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-500 mb-1 font-medium">Business Name</label>
                <input
                  value={business.businessName}
                  onChange={e => setBusiness({ ...business, businessName: e.target.value })}
                  className="w-full border rounded-xl px-3.5 py-2.5"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1 font-medium">Currency Symbol</label>
                <input
                  value={business.currency}
                  onChange={e => setBusiness({ ...business, currency: e.target.value })}
                  className="w-full border rounded-xl px-3.5 py-2.5"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1 font-medium">Default Low-Stock Threshold</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={business.lowStockThresholdDefault}
                  onChange={e => setBusiness({ ...business, lowStockThresholdDefault: e.target.value })}
                  className="w-full border rounded-xl px-3.5 py-2.5"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1 font-medium">POS Sales Tax Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={business.taxRate}
                  onChange={e => setBusiness({ ...business, taxRate: e.target.value })}
                  className="w-full border rounded-xl px-3.5 py-2.5"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Business Address</label>
              <input
                value={business.businessAddress}
                onChange={e => setBusiness({ ...business, businessAddress: e.target.value })}
                className="w-full border rounded-xl px-3.5 py-2.5"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || demoReadOnly}
              className="bg-blue-600 text-white rounded-xl px-6 py-2.5 font-semibold disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Business Settings'}
            </button>
          </form>
        )}

        {/* TAB 3: SECURITY */}
        {tab === 'Security' && (
          <form onSubmit={handlePasswordChange} className="max-w-md space-y-3.5 text-xs">
            <h2 className="font-bold text-sm text-slate-900">Change Account Password</h2>{isDemoSandbox() && <p className="text-xs text-slate-500">Password changes are unavailable in the browser sandbox. Your real sign-in credentials stay unchanged.</p>}
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Current Password</label>
              <input
                type="password"
                required
                value={pw.currentPassword}
                onChange={e => setPw({ ...pw, currentPassword: e.target.value })}
                className="w-full border rounded-xl px-3.5 py-2.5"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">New Password (min 6 chars)</label>
              <input
                type="password"
                required
                minLength={6}
                value={pw.newPassword}
                onChange={e => setPw({ ...pw, newPassword: e.target.value })}
                className="w-full border rounded-xl px-3.5 py-2.5"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Confirm New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={pw.confirmPassword}
                onChange={e => setPw({ ...pw, confirmPassword: e.target.value })}
                className="w-full border rounded-xl px-3.5 py-2.5"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || demoReadOnly || isDemoSandbox()}
              className="bg-blue-600 text-white rounded-xl px-6 py-2.5 font-semibold disabled:opacity-50"
            >
              {submitting ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}

        {/* TAB 4: PREFERENCES */}
        {tab === 'Preferences' && (
          <form onSubmit={handleSaveSettings} className="max-w-lg space-y-4 text-xs">
            <h2 className="font-bold text-sm text-slate-900">System Preferences</h2>
            <label className="flex items-center justify-between p-3.5 border rounded-xl cursor-pointer hover:bg-slate-50">
              <div>
                <div className="font-semibold text-slate-800">Enable Low-Stock Alert Notifications</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Displays active low-stock and out-of-stock alerts in the header notification bell.
                </div>
              </div>
              <input
                type="checkbox"
                checked={preferences.lowStockAlerts}
                onChange={e => setPreferences({ ...preferences, lowStockAlerts: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between p-3.5 border rounded-xl cursor-pointer hover:bg-slate-50">
              <div>
                <div className="font-semibold text-slate-800">Enable Automated AI Reorder Suggestions</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Generates 14-day Holt demand forecast and safety-stock restock recommendations in AI Insights.
                </div>
              </div>
              <input
                type="checkbox"
                checked={preferences.autoReorderSuggestions}
                onChange={e => setPreferences({ ...preferences, autoReorderSuggestions: e.target.checked })}
              />
            </label>
            <div className="flex items-center justify-between p-3.5 border border-slate-200 bg-slate-50/70 rounded-xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Monthly Email Performance Summaries</span>
                  {!smtpConfigured && (
                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-semibold">
                      SMTP Not Configured
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {smtpConfigured
                    ? 'Sends monthly revenue and stockout summary reports via configured SMTP server.'
                    : 'Outbound email delivery is not configured in this environment (set SMTP_HOST to enable).'}
                </div>
              </div>
              <input
                type="checkbox"
                disabled={!smtpConfigured}
                checked={smtpConfigured ? Boolean(preferences.emailReports) : false}
                onChange={e => setPreferences({ ...preferences, emailReports: e.target.checked })}
              />
            </div>
            <button
              type="submit"
              disabled={submitting || demoReadOnly}
              className="bg-blue-600 text-white rounded-xl px-6 py-2.5 font-semibold disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Preferences'}
            </button>
          </form>
        )}
        </fieldset>
      </div>
    </div>
  );
}
