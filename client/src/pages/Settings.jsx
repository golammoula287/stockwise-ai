import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState('Profile');
  const [profile, setProfile] = useState({
    name: 'John Doe',
    email: 'john@example.com',
    phone: '01712345678',
  });
  const [business, setBusiness] = useState({
    businessName: 'StockPro',
    currency: '৳',
    taxRate: 0,
    lowStockThresholdDefault: 5,
    businessAddress: 'Dhaka, Bangladesh',
  });
  const [preferences, setPreferences] = useState({
    lowStockAlerts: true,
    emailReports: true,
    autoReorderSuggestions: true,
    dateFormat: 'MMM DD, YYYY',
  });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    api.get('/settings')
      .then(res => {
        if (res.data.profile) {
          setProfile({
            name: res.data.profile.name || 'John Doe',
            email: res.data.profile.email || 'john@example.com',
            phone: res.data.profile.phone || '01712345678',
          });
        }
        if (res.data.business) {
          setBusiness({
            businessName: res.data.business.name || 'StockPro',
            currency: res.data.business.currency || '৳',
            taxRate: res.data.business.taxRate ?? 0,
            lowStockThresholdDefault: res.data.business.lowStockThresholdDefault ?? 5,
            businessAddress: res.data.business.businessAddress || 'Dhaka, Bangladesh',
          });
        }
        if (res.data.preferences) {
          setPreferences(res.data.preferences);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setMsg({ text: '', type: '' });
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
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setMsg({ text: '', type: '' });
    if (pw.newPassword !== pw.confirmPassword) {
      setMsg({ text: 'New password and confirmation do not match.', type: 'error' });
      return;
    }
    try {
      await api.put('/settings/password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      });
      setMsg({ text: 'Password updated successfully.', type: 'success' });
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (e2) {
      setMsg({ text: e2.response?.data?.message || 'Password update failed', type: 'error' });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-extrabold text-xl text-slate-900">Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">Manage your profile and business settings.</p>
      </div>

      {/* Card with Underline Tabs */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex gap-6 border-b border-slate-200 text-xs font-semibold">
          {['Profile', 'Business', 'Security', 'Preferences'].map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setMsg({ text: '', type: '' }); }}
              className={`pb-3 border-b-2 transition ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {msg.text && (
          <div className={`p-3 rounded-xl text-xs font-medium ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {msg.text}
          </div>
        )}

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
                  onClick={() => setMsg({ text: 'Avatar initials automatically sync with your profile name.', type: 'success' })}
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
                    value={profile.phone}
                    onChange={e => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 font-semibold shadow-sm transition mt-2"
                >
                  Update Profile
                </button>
              </div>
            </div>
          </form>
        )}

        {/* TAB 2: BUSINESS */}
        {tab === 'Business' && (
          <form onSubmit={handleSaveSettings} className="max-w-xl space-y-4 text-xs">
            <h2 className="font-bold text-sm text-slate-900">Business Configuration</h2>
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
                  value={business.lowStockThresholdDefault}
                  onChange={e => setBusiness({ ...business, lowStockThresholdDefault: e.target.value })}
                  className="w-full border rounded-xl px-3.5 py-2.5"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1 font-medium">Tax Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
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
            <button type="submit" className="bg-blue-600 text-white rounded-xl px-6 py-2.5 font-semibold">
              Save Business Settings
            </button>
          </form>
        )}

        {/* TAB 3: SECURITY */}
        {tab === 'Security' && (
          <form onSubmit={handlePasswordChange} className="max-w-md space-y-3.5 text-xs">
            <h2 className="font-bold text-sm text-slate-900">Change Account Password</h2>
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
            <button type="submit" className="bg-blue-600 text-white rounded-xl px-6 py-2.5 font-semibold">
              Update Password
            </button>
          </form>
        )}

        {/* TAB 4: PREFERENCES */}
        {tab === 'Preferences' && (
          <form onSubmit={handleSaveSettings} className="max-w-md space-y-4 text-xs">
            <h2 className="font-bold text-sm text-slate-900">System Preferences</h2>
            <label className="flex items-center justify-between p-3 border rounded-xl cursor-pointer">
              <span>Enable Low-Stock Alert Notifications</span>
              <input
                type="checkbox"
                checked={preferences.lowStockAlerts}
                onChange={e => setPreferences({ ...preferences, lowStockAlerts: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between p-3 border rounded-xl cursor-pointer">
              <span>Enable Automated AI Reorder Suggestions</span>
              <input
                type="checkbox"
                checked={preferences.autoReorderSuggestions}
                onChange={e => setPreferences({ ...preferences, autoReorderSuggestions: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between p-3 border rounded-xl cursor-pointer">
              <span>Monthly Email Performance Summaries</span>
              <input
                type="checkbox"
                checked={preferences.emailReports}
                onChange={e => setPreferences({ ...preferences, emailReports: e.target.checked })}
              />
            </label>
            <button type="submit" className="bg-blue-600 text-white rounded-xl px-6 py-2.5 font-semibold">
              Save Preferences
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
