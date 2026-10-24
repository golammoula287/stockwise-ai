import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import useOverlay from '../lib/useOverlay';
import SearchBox from '../components/SearchBox';
import api from '../lib/api';

export default function Users({ onChanged }) {
  const { user } = useAuth(), confirm = useConfirm();
  const owner = user?.isSuperAdmin === true;
  const allowed = owner || (user?.role === 'admin' && user?.privateWorkspace === true && !user?.adminId);
  const accountLabel = owner ? 'admin' : 'staff';
  const [rows, setRows] = useState([]), [search, setSearch] = useState(''), [page, setPage] = useState(1), [pages, setPages] = useState(1), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [form, setForm] = useState(null);
  const overlay = useOverlay(Boolean(form), () => { if (!busy) setForm(null); });
  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const { data } = await api.get('/users', { params: { search, page } });
      setRows(data.users); setPages(data.pages); setTotal(data.total);
    } catch (e) { setError(e.response?.data?.message || 'Could not load accounts.'); }
    finally { setLoading(false); }
  }, [search, page, allowed]);
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);
  const mutate = async (action, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(message); setForm(null); await load(); await onChanged?.(); return true; }
    catch (e) { setError(e.response?.data?.message || 'Could not update this account.'); return false; }
    finally { setBusy(false); }
  };
  const save = async e => {
    e.preventDefault(); if (busy) return;
    const reset = form.mode === 'password';
    if (!await confirm({ title: reset ? 'Reset password?' : form.id ? 'Save account name?' : `Create ${accountLabel} account?`, message: reset ? `Set a new password for ${form.email} and end their existing sessions? Share the new password privately.` : form.id ? `Update the name for ${form.email}?` : owner ? `Create a private admin workspace for ${form.email}?` : `Give ${form.email} staff access to your workspace? Staff cannot manage inventory, passwords or business settings.`, confirmLabel: reset ? 'Reset password' : 'Save account' })) return;
    await mutate(() => reset ? api.patch(`/users/${form.id}/password`, { password: form.password }) : form.id ? api.patch(`/users/${form.id}`, { name: form.name }) : api.post('/users', { name: form.name, email: form.email, password: form.password, role: accountLabel }), reset ? 'Password reset. Share it privately.' : 'Account saved.');
  };
  const restrict = async row => {
    const isActive = row.isActive === false;
    if (!await confirm({ title: isActive ? 'Restore account access?' : 'Restrict account?', message: owner ? `${isActive ? 'Restore' : 'Block'} access for ${row.email} and their staff. Existing sessions will end. Individually restricted staff remain restricted.` : `${isActive ? 'Restore' : 'Block'} access for ${row.email}. Existing sessions will end.`, confirmLabel: isActive ? 'Restore access' : 'Restrict account', destructive: !isActive })) return;
    await mutate(() => api.patch(`/users/${row.id}/status`, { isActive }), isActive ? 'Account access restored.' : 'Account restricted.');
  };
  const remove = async row => {
    if (!await confirm({ title: owner ? 'Delete admin and workspace?' : 'Delete staff account?', message: owner ? `Permanently delete ${row.email}, all their staff accounts, products, customers, sales and stock history? This cannot be undone.` : `Permanently delete ${row.email}? Their access will end. Business records will remain. This cannot be undone.`, confirmLabel: owner ? 'Delete admin and workspace' : 'Delete staff', destructive: true })) return;
    const removed = await mutate(() => api.delete(`/users/${row.id}`), owner ? 'Admin, staff and workspace deleted.' : 'Staff account deleted.');
    if (removed && page > 1 && rows.length === 1) setPage(page - 1);
  };
  if (!allowed) return <div className="sales-panel"><h1>Accounts</h1><p className="mt-3 text-sm text-slate-500">Your administrator manages account access.</p></div>;
  return <div className="space-y-5">
    <header className="insights-header"><div><h1>{owner ? 'Manage admins' : 'Manage staff'}</h1><p>{owner ? 'App owner · Admin workspaces and their access' : 'Staff share your workspace with limited access'}</p></div><button className="sales-primary-button" disabled={busy} onClick={() => { setError(''); setForm({ name: '', email: '', password: '', mode: 'create' }); }}>Add {accountLabel}</button></header>
    {error && <p role="alert" className="insights-notice insights-error">{error}</p>}{notice && <p role="status" className="insights-notice">{notice}</p>}
    <section className="sales-panel"><div className="history-search-row"><SearchBox label={`Search ${accountLabel} accounts`} value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder="Name or email" /><span className="history-search-status">{loading ? 'Loading…' : `${total} accounts`}</span></div>
      <div className="overflow-x-auto"><table className="insights-table" style={{ minWidth: 720 }}><thead><tr><th>Name</th><th>Email</th><th>Status</th>{owner && <th>Staff</th>}<th>Actions</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.email}</td><td>{row.isSuperAdmin ? 'App owner' : row.isActive === false ? 'Restricted' : 'Active'}</td>{owner && <td>{row._count?.staff || 0}</td>}<td>{row.isSuperAdmin ? <span>Owner account</span> : <div className="flex flex-wrap gap-3"><button className="insights-restock" disabled={busy} onClick={() => { setError(''); setForm({ ...row, password: '', mode: 'edit' }); }}>Edit</button><button className="insights-restock" disabled={busy} onClick={() => { setError(''); setForm({ ...row, password: '', mode: 'password' }); }}>Reset password</button><button className="insights-restock" disabled={busy} onClick={() => restrict(row)}>{row.isActive === false ? 'Restore access' : 'Restrict'}</button><button className="insights-restock" disabled={busy} onClick={() => remove(row)}>Delete</button></div>}</td></tr>)}{!rows.length && !loading && <tr><td colSpan={owner ? 5 : 4}>No accounts match your search.</td></tr>}</tbody></table></div>
      <div className="flex justify-end items-center gap-4 pt-4 text-xs"><button disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages || loading} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </section>
    {form && <div ref={overlay} role="dialog" aria-modal="true" aria-label={form.mode === 'password' ? 'Reset password' : form.id ? 'Edit account' : `Add ${accountLabel}`} className="workspace-dialog fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><form onSubmit={save} className="login-form bg-white rounded-xl p-6 w-full max-w-md max-h-[90dvh] overflow-y-auto"><h2 className="font-semibold text-lg">{form.mode === 'password' ? 'Reset password' : form.id ? 'Edit account' : `Add ${accountLabel}`}</h2>{error && <p role="alert" className="login-error">{error}</p>}
      {form.mode !== 'password' && <label>Full name<input required minLength={2} maxLength={80} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} disabled={busy} /></label>}
      <label>Email<input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={busy || Boolean(form.id)} autoComplete="off" /></label>
      {(!form.id || form.mode === 'password') && <label>{form.id ? 'New password' : 'Password'}<input aria-label={form.id ? 'New password' : 'Account password'} type="password" required minLength={12} maxLength={72} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} disabled={busy} autoComplete="new-password" /><span className="login-field-help">12–72 characters. Share privately. Staff cannot change their own password.</span></label>}
      <div className="action-confirm-actions"><button type="button" disabled={busy} onClick={() => setForm(null)}>Cancel</button><button className="is-primary" disabled={busy}>{busy ? 'Saving…' : form.mode === 'password' ? 'Reset password' : 'Save account'}</button></div>
    </form></div>}
  </div>;
}
