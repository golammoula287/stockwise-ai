import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand';
import Users from './Users';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function OwnerManagement() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setOverview((await api.get('/users/overview')).data); }
    catch (err) { setError(err.response?.data?.message || 'Could not load the account overview.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const metrics = [['Business admins', 'totalAdmins'], ['Active admins', 'activeAdmins'], ['Restricted admins', 'restrictedAdmins'], ['Staff accounts', 'totalStaff']];
  return <div className="owner-shell">
    <header className="owner-topbar"><Link to="/management" aria-label="StockWise AI management"><Brand /></Link><div className="owner-session"><span className="owner-role">App Owner</span><span className="owner-email">{user.email}</span><button onClick={() => { logout(); navigate('/login', { replace: true }); }}>Sign out</button></div></header>
    <main className="owner-main">
      <section className="owner-heading"><div><p className="owner-eyebrow">ACCOUNT MANAGEMENT</p><h1>Manage StockWise AI</h1><p>Admin workspaces, staff access and account controls.</p></div><button className="insights-restock" disabled={loading} onClick={refresh}>{loading ? 'Refreshing…' : 'Refresh overview'}</button></section>
      {error && <p role="alert" className="insights-notice insights-error">{error}</p>}
      <section className="owner-metrics" aria-label="Account overview" aria-busy={loading}>{metrics.map(([label, key]) => <article key={key}><p>{label}</p><strong>{overview ? overview[key].toLocaleString() : '—'}</strong></article>)}</section>
      <p className="owner-access-note">Restricting an admin also blocks their staff. Deleting an admin permanently removes their staff and private workspace data after confirmation.</p>
      <Users onChanged={refresh} />
    </main>
  </div>;
}
