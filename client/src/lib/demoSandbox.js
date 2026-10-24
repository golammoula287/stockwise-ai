import { createDemoStore } from './demoStore';
let store = null;
let token = null;
export const isDemoSandbox = () => store !== null;
export function resetDemoSandbox() { store = null; token = null; }
export function sandboxFor(sessionToken) {
  if (!store || token !== sessionToken) {
    let user = {}; try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch { /* Use safe defaults. */ }
    store = createDemoStore(user); token = sessionToken;
    sessionStorage.removeItem('stockwise_chat_history_v1');
  }
  return store;
}
