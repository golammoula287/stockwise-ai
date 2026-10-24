import Brand from '../components/Brand';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleSignIn from '../components/GoogleSignIn';
import api from '../lib/api';
import { accountHome } from '../lib/accountHome.mjs';

export default function Login() {
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock,setCapsLock]=useState(false);
  const [error, setError] = useState('');
  const [googleAttempt, setGoogleAttempt] = useState(0);
  const [demoSigningIn, setDemoSigningIn] = useState(false);
  const { login, loginWithGoogle, loading } = useAuth();
  const navigate = useNavigate();
  const handleError = err => setError(err.response?.data?.message || 'Sign-in could not be completed. Please try again.');
  const submit = async event => {
    event.preventDefault();
    if (loading || submitting) return;
    setError(''); setNotice('');
    if (registering) {
      setSubmitting(true);
      try {
        await api.post('/auth/signup', { name: name.trim(), email: email.trim(), password });
        setRegistering(false); setPassword(''); setNotice('Account created. Sign in to your new, empty workspace.');
      } catch (err) { handleError(err); }
      finally { setSubmitting(false); }
      return;
    }
    try { const session = await login(email.trim(), password); navigate(accountHome(session.user), { replace: true }); }
    catch (err) { handleError(err); }
  };
  const googleLogin = async (credential, challenge) => {
    if (loading) return;
    setError('');
    try { const session = await loginWithGoogle(credential, challenge); navigate(accountHome(session.user), { replace: true }); }
    catch (err) { handleError(err); setGoogleAttempt(value => value + 1); }
  };
  const openDemo = async () => {
    if (loading || submitting || demoSigningIn) return;
    setError(''); setNotice(''); setDemoSigningIn(true);
    try {
      // Dedicated public staff credentials, also published in README.md.
      await login('visitor@stockwise.example', 'HNcwra_z0cyC5T9fNQNDB4t-2gkoTxBV');
      navigate('/dashboard');
    } catch (err) { handleError(err); }
    finally { setDemoSigningIn(false); }
  };
  return <div className="landing login-page">
    <header className="login-header landing-container"><Link to="/" aria-label="StockWise AI home" className="login-brand-link"><Brand /></Link><Link to="/" className="login-back">Back to home</Link></header>
    <main className="login-main">
      <section className="login-story landing-enter" aria-label="About your workspace"><div className="login-story-content"><p className="landing-eyebrow">STOCKWISE AI</p><h2>A clearer view.<br />A better working day.</h2><p className="login-story-intro">Your inventory, sales, and customer details.<br className="login-desktop-break" /> Together in one workspace.</p><div className="login-story-caption"><span>Inventory</span><span>Sales</span><span>Insights</span></div></div><p className="login-photo-note">Illustrative workspace · Fictional demo data</p></section>
      <section className="login-form-panel landing-enter landing-enter-later" aria-labelledby="login-title"><div className="login-form-inner"><p className="landing-eyebrow">YOUR WORKSPACE</p><h1 id="login-title">{registering ? 'Create an account' : 'Welcome back'}</h1><p className="login-subtitle">{registering ? 'Start with an empty, private workspace. Your changes are saved.' : 'Sign in to your inventory and sales workspace.'}</p>
        {!registering && <><GoogleSignIn key={googleAttempt} onCredential={googleLogin} disabled={loading} /><div className="login-divider"><span />or use your email<span /></div></>}
        {notice && <p className="login-success" role="status">{notice}</p>}
        <form onSubmit={submit} className="login-form" aria-busy={loading || submitting}>
          {registering && <div><label htmlFor="register-name">Full name</label><input id="register-name" name="name" autoComplete="name" minLength={2} maxLength={80} required value={name} onChange={event => setName(event.target.value)} disabled={submitting} /></div>}
          <div><label htmlFor="login-email">Email address</label><input id="login-email" type="email" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" required value={email} onChange={event => setEmail(event.target.value)} disabled={loading || submitting} aria-describedby={error ? 'login-error' : undefined} /></div>
          <div><div className="login-label-row"><label htmlFor="login-password">Password</label><a href="mailto:golammoula287@gmail.com?subject=StockWise%20AI%20account%20help">Need help?</a></div><div className="login-password-field"><input id="login-password" type={showPassword ? 'text' : 'password'} name="password" onKeyUp={event=>setCapsLock(event.getModifierState('CapsLock'))} onKeyDown={event=>setCapsLock(event.getModifierState('CapsLock'))} onBlur={()=>setCapsLock(false)} autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 12 : undefined} maxLength={registering ? 72 : undefined} placeholder={registering ? 'At least 12 characters' : 'Enter your password'} required value={password} onChange={event => setPassword(event.target.value)} disabled={loading || submitting} aria-describedby={[error?'login-error':'',registering?'register-password-help':'',capsLock?'login-caps-lock':''].filter(Boolean).join(' ') || undefined} /><button type="button" disabled={loading || submitting} onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</button></div>{registering && <p className="login-field-help" id="register-password-help">Use 12–72 characters for your password.</p>}{capsLock && <p className="login-field-help" id="login-caps-lock" role="status">Caps Lock is on.</p>}</div>
          {error && <p id="login-error" className="login-error" role="alert">{error}</p>}
          <button type="submit" className="landing-button login-submit" disabled={loading || submitting}>{submitting ? 'Creating account…' : loading ? 'Signing in…' : registering ? 'Create account' : 'Sign in'}</button>
        </form>
        {!registering && <button type="button" className="landing-button login-demo-button" onClick={openDemo} disabled={loading || submitting || demoSigningIn}>{demoSigningIn ? 'Opening demo…' : 'Try demo'}</button>}
        <p className="login-access-note">{registering ? 'Already have an account?' : 'New to StockWise?'} <button type="button" disabled={loading || submitting} onClick={() => { setRegistering(value => !value); setError(''); setNotice(''); setPassword(''); setShowPassword(false); setCapsLock(false); }}>{registering ? 'Sign in' : 'Create an account'}</button></p>
        <div className="login-demo-caption"><span className="landing-status-dot" /><p>{registering ? 'Your account starts empty. Inventory and sales are saved privately.' : 'Try demo explores fictional data. Create an account for your own saved workspace.'}</p></div>
      </div></section>
    </main>
    <footer className="login-footer landing-container"><span>© {new Date().getFullYear()} StockWise AI</span><span>A clearer view of your working day.</span></footer>
  </div>;
}
