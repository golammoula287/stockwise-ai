import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function setup() {
  const source = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace('import.meta.env.VITE_API_URL', 'undefined')
    .replace('export default api;', 'globalThis.api = api;');
  let token = 'private-a';
  let intercept;
  let sandboxCalls = 0;
  let failHealth = false;
  const checks = [];
  const api = { defaults: { baseURL: '/api' }, interceptors: { request: { use(fn) { intercept = fn; } }, response: { use() {} } } };
  const transport = { async get(path, config) {
    checks.push(config.headers.Authorization);
    if (failHealth) throw new Error('Authentication failed');
    return { data: { demoReadOnly: token === 'demo', privateWorkspace: token !== 'demo' } };
  } };
  let creates = 0;
  vm.runInNewContext(source, {
    URL, axios: { create: () => creates++ === 0 ? api : transport },
    localStorage: { getItem: () => token },
    sandboxFor: () => { sandboxCalls++; return { handle: () => ({ sample: true }) }; },
  });
  return { request: path => intercept({ url: path, headers: {} }), setToken: value => { token = value; }, fail: () => { failHealth = true; }, checks, sandboxCalls: () => sandboxCalls };
}

test('private accounts use real API requests and never instantiate seeded demo data', async () => {
  const app = setup();
  for (const path of ['/products', '/sales', '/dashboard/monthly', '/settings', '/health']) {
    const config = await app.request(path);
    assert.equal(config.adapter, undefined);
    assert.equal(config.headers.Authorization, 'Bearer private-a');
  }
  assert.equal(app.sandboxCalls(), 0);
  assert.deepEqual(app.checks, ['Bearer private-a']);
});

test('switching between demo and private accounts refreshes authenticated mode without sharing sample data', async () => {
  const app = setup();
  await app.request('/products');
  app.setToken('demo');
  const demo = await app.request('/products');
  assert.equal(typeof demo.adapter, 'function');
  assert.equal(app.sandboxCalls(), 1);
  app.setToken('private-b');
  assert.equal((await app.request('/products')).adapter, undefined);
  assert.equal(app.sandboxCalls(), 1);
  assert.deepEqual(app.checks, ['Bearer private-a', 'Bearer demo', 'Bearer private-b']);
});

test('failed health authentication does not silently fall back to sample data', async () => {
  const app = setup();
  app.fail();
  await assert.rejects(app.request('/dashboard/monthly'), /Authentication failed/);
  assert.equal(app.sandboxCalls(), 0);
});
