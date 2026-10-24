import axios from 'axios';
import { sandboxFor } from './demoSandbox';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 60000,
});

const transport = axios.create({ baseURL: api.defaults.baseURL, timeout: 10000 });
let healthCheck;
let healthToken;
api.interceptors.request.use(async cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  const url = new URL(cfg.url, 'https://local.example');
  const path = url.pathname;
  if (path === '/users' || path.startsWith('/users/') || path.startsWith('/auth/')) return cfg;
  if (!token && path !== '/health') return cfg;
  if (healthToken !== token) { healthCheck = null; healthToken = token; }
  const health = await (healthCheck ||= transport.get('/health', { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(response => response.data).catch(error => { healthCheck = null; throw error; }));
  if (health?.demoReadOnly !== true) return cfg;
  if (path === '/health') {
    sandboxFor(token);
    cfg.adapter = async config => ({ data: { ...health, demoReadOnly: false, demoSandbox: true }, status: 200, statusText: 'OK', headers: {}, config });
    return cfg;
  }
  const store = sandboxFor(token);
  if (path === '/chat/status') return cfg;
  cfg.adapter = async config => {
    let body = config.data || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const params = { ...Object.fromEntries(url.searchParams), ...(config.params || {}) };
    if (path === '/chat') {
      const response = await transport.post('/chat/sandbox', { ...body, snapshot: store.snapshot() }, { headers: { Authorization: `Bearer ${token}` }, timeout: 250000 });
      return { ...response, config };
    }
    try { return { data: store.handle(config.method || 'get', path, body, params), status: 200, statusText: 'OK', headers: {}, config }; }
    catch (error) { throw new axios.AxiosError(error.message, 'ERR_BAD_REQUEST', config, null, { data: { message: error.message }, status: error.status || 400, statusText: 'Error', headers: {}, config }); }
  };
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('stockwise_chat_history_v1');
      if (!location.pathname.includes('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
