import test from 'node:test';
import assert from 'node:assert/strict';
import { accountHome } from '../src/lib/accountHome.mjs';

test('verified app owner sessions land in management instead of a shop dashboard', () => {
  assert.equal(accountHome({ role: 'admin', isSuperAdmin: true }), '/management');
});
test('business admins, staff and demo users retain the business dashboard', () => {
  for (const user of [{ role: 'admin', privateWorkspace: true }, { role: 'staff' }, { role: 'admin', name: 'Workspace Owner' }, null]) {
    assert.equal(accountHome(user), '/dashboard');
  }
});
