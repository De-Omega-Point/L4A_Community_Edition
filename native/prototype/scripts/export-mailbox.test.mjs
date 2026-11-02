import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src-tauri/src/export-mailbox.js', import.meta.url), 'utf8');
function setup() {
  let id = 0; const revoked = [], clicked = [], timers = [];
  const sandbox = { Blob, TextEncoder, crypto: { randomUUID: () => `00000000-0000-0000-0000-${String(++id).padStart(12, '0')}` }, URL: { createObjectURL: () => `blob:https://example.test/${id + 1}`, revokeObjectURL: u => revoked.push(u) }, document: { createElement: () => ({ click() { clicked.push(this.href); } }) }, setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {} };
  sandbox.window = sandbox; sandbox.top = sandbox;
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  return { api: sandbox.__L4A_EXPORT_MAILBOX_V1__, sandbox, clicked, revoked, timers };
}
test('single pending export, exact URL and token, one-shot bounded content mailbox', async () => {
  const { api, clicked, revoked } = setup();
  const pending = api.save('backup.json', '{}', 'application/json');
  assert.equal((await api.save('backup.json', '{}', 'application/json')).status, 'busy');
  assert.equal(api.take('blob:https://evil.test/1'), null);
  const data = api.take(clicked[0]); assert.equal(data.text, '{}');
  assert.equal(api.take(clicked[0]), null);
  api.complete(clicked[0], 'forged', 'saved');
  assert.equal((await api.save('backup.json', '{}', 'application/json')).status, 'busy');
  api.complete(clicked[0], data.token, 'cancelled');
  assert.equal((await pending).status, 'cancelled'); assert.equal(revoked.length, 1);
  const again = api.save('backup.json', '{}', 'application/json');
  api.complete(clicked[0], data.token, 'saved'); // stale completion cannot finish new request
  const next = api.take(clicked[1]); api.complete(clicked[1], next.token, 'failed');
  assert.equal((await again).status, 'failed');
});
test('oversize fails before a Blob/download; timeout is unconfirmed, never saved', async () => {
  const { api, clicked, timers } = setup();
  assert.equal((await api.save('backup.json', 'a'.repeat(20*1024*1024+1), 'application/json')).status, 'failed');
  assert.equal(clicked.length, 0);
  const p = api.save('backup.json', '{}', 'application/json'); timers[0]();
  assert.equal((await p).status, 'unconfirmed');
});
test('mailbox cannot be replaced and subframes receive no transport', () => {
  const { sandbox, api } = setup();
  assert.equal(Object.getOwnPropertyDescriptor(sandbox, '__L4A_EXPORT_MAILBOX_V1__').writable, false);
  assert.equal(Object.isFrozen(api), true);
  const subframe = { window: { top: {} } }; vm.createContext(subframe); vm.runInContext(source, subframe);
  assert.equal(subframe.window.__L4A_EXPORT_MAILBOX_V1__, undefined);
});
test('invalid metadata fails before transport and click exceptions release the request', async () => {
  const { api, sandbox, clicked, revoked } = setup();
  for (const args of [[{}, '{}', 'application/json'], ['x'.repeat(181), '{}', 'application/json'], ['x.json', '{}', {}], ['x.json', '{}', 'x'.repeat(65)]]) {
    assert.equal((await api.save(...args)).status, 'failed');
  }
  assert.equal(clicked.length, 0);
  sandbox.document.createElement = () => ({ click() { throw new Error('blocked'); } });
  assert.equal((await api.save('x.json', '{}', 'application/json')).status, 'failed');
  assert.equal(revoked.length, 1);
  assert.equal((await api.save('x.json', '{}', 'application/json')).status, 'failed');
  assert.equal(revoked.length, 2);
});

test('an open native dialog stays single-flight after timeout until it is closed', async () => {
  const { api, clicked, timers } = setup();
  const first = api.save('backup.json', '{}', 'application/json');
  const data = api.take(clicked[0]); timers[0]();
  assert.equal((await first).status, 'unconfirmed');
  assert.equal((await api.save('backup.json', '{}', 'application/json')).status, 'busy');
  api.complete(clicked[0], data.token, 'cancelled');
  const next = api.save('backup.json', '{}', 'application/json');
  const nextData = api.take(clicked[1]); api.complete(clicked[1], nextData.token, 'saved');
  assert.equal((await next).status, 'saved');
});
