import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, installDom } from './helpers/local-storage.mjs';
import { storageKeys } from '../public/community/js/state.js';
import { bindMembership } from '../public/community/js/membership.js';

test('existing members see an honest ownership limitation, not an unusable update form', () => {
  globalThis.localStorage = memoryStorage();
  const membership = { email: 'owner@example.test', businessName: 'Synthetic Shop', interests: ['product-updates'] };
  localStorage.setItem(storageKeys.communityMembership, JSON.stringify(membership));
  const element = installDom();
  let click;
  element('btnUpdateMembership').addEventListener = (_event, handler) => { click = handler; };
  bindMembership();
  assert.equal(element('membershipFormPanel').hidden, true);
  assert.equal(element('membershipSuccess').hidden, false);
  click();
  assert.equal(element('membershipFormPanel').hidden, true);
  assert.match(element('membershipSuccessMessage').textContent, /requires verified ownership/);
  assert.match(element('membershipSuccessMessage').textContent, /have not been changed/);
  assert.deepEqual(JSON.parse(localStorage.getItem(storageKeys.communityMembership)), membership);
});
