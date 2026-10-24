import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';

let googleScript;
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!googleScript) googleScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => { googleScript = null; script.remove(); reject(new Error('Google sign-in could not load.')); }, 12000);
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => { clearTimeout(timeout); googleScript = null; script.remove(); reject(new Error('Google sign-in could not load.')); };
    document.head.appendChild(script);
  });
  return googleScript;
}

export default function GoogleSignIn({ onCredential, disabled }) {
  const host = useRef(null);
  const callbacks = useRef({ onCredential });
  callbacks.current = { onCredential };
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    let alive = true;
    let resize;
    (async () => {
      try {
        const { data } = await api.get('/auth/google/config');
        if (!alive) return;
        if (!data.configured) { setStatus('unconfigured'); return; }
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || data.clientId;
        if (clientId !== data.clientId) throw new Error('Google sign-in configuration mismatch.');
        const [{ data: challenge }] = await Promise.all([api.get('/auth/google/challenge'), loadGoogle()]);
        if (!alive) return;
        window.google.accounts.id.initialize({ client_id: clientId, nonce: challenge.nonce, auto_select: false, callback: response => { if (alive) callbacks.current.onCredential(response.credential, challenge.challenge); } });
        let lastWidth;
        const render = () => {
          const width = Math.floor(Math.min(400, host.current?.clientWidth || 280));
          if (width === lastWidth || !host.current) return;
          lastWidth = width;
          host.current.replaceChildren();
          window.google.accounts.id.renderButton(host.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width });
        };
        render();
        if ('ResizeObserver' in window) { resize = new ResizeObserver(render); resize.observe(host.current); }
        setStatus('ready');
      } catch (_) {
        if (alive) setStatus('error');
      }
    })();
    return () => { alive = false; resize?.disconnect(); };
  }, []);
  return <div className="google-signin-wrap" aria-busy={status === 'loading'}>
    <div ref={host} className={`google-signin-host ${disabled ? 'google-signin-busy' : ''}`} inert={disabled ? '' : undefined} />
    {status !== 'ready' && <><button type="button" className="login-google-fallback" disabled><span aria-hidden="true">G</span>{status === 'loading' ? 'Preparing Google sign-in…' : 'Continue with Google'}</button><p className="login-provider-note" role="status">{status === 'unconfigured' ? 'Google sign-in is not enabled yet. Please use email and password.' : status === 'error' ? 'Google sign-in is temporarily unavailable. Please use email and password.' : 'Connecting securely to Google.'}</p></>}
  </div>;
}
