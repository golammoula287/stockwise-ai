import { resetDemoSandbox } from '../lib/demoSandbox';
import { createContext, useContext, useEffect, useState } from 'react';
import api from '../lib/api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (!localStorage.getItem('token')) return null;
    try {
      const s = localStorage.getItem('user');
      return s ? JSON.parse(s) : null;
    } catch (_) {
      localStorage.removeItem('user');
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(() => Boolean(localStorage.getItem('token')));

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/auth/me').then(r => { setUser(r.data); localStorage.setItem('user', JSON.stringify(r.data)); }).catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      }).finally(() => setInitializing(false));
    }
  }, []);

  const saveSession = data => {
    resetDemoSandbox();
    sessionStorage.removeItem('stockwise_chat_history_v1');
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const login = async (email, password) => {
    setLoading(true);
    try { return saveSession((await api.post('/auth/login', { email, password })).data); }
    finally { setLoading(false); }
  };

  const loginWithGoogle = async (credential, challenge) => {
    setLoading(true);
    try { return saveSession((await api.post('/auth/google', { credential, challenge })).data); }
    finally { setLoading(false); }
  };

  const logout = () => {
    resetDemoSandbox();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('stockwise_chat_history_v1');
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, setUser, login, loginWithGoogle, logout, loading, initializing }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
