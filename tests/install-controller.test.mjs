import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstallController } from '../public/community/js/install-controller.js';
function harness() {
  const listeners = {}, states = [], messages = [];
  let help = 0, installed = 0, requested = 0;
  const controller = createInstallController({ target: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    render: state => states.push(state), status: message => messages.push(message), showHelp: () => help++, installed: () => installed++, requested: () => requested++ });
  return { controller, listeners, states, messages, counts: () => ({ help, installed, requested }), offer(prompt) { listeners.beforeinstallprompt({ preventDefault() {}, prompt }); } };
}
test('unavailable capability opens explicitly requested help without claiming installation', async () => {
  const h = harness(); await h.controller.install();
  assert.deepEqual(h.counts(), { help: 1, installed: 0, requested: 0 });
  assert.equal(h.controller.hasPrompt(), false);
});
test('real prompt executes synchronously from action, single-use and guarded against repeated clicks', async () => {
  const h = harness(); let resolve, called = 0;
  h.offer(() => { called++; return new Promise(r => { resolve = r; }); });
  const action = h.controller.install(); assert.equal(called, 1);
  await h.controller.install(); assert.equal(called, 1);
  assert.equal(h.states.at(-1).pending, true);
  resolve({ outcome: 'accepted' }); await action;
  assert.equal(h.counts().installed, 0); assert.match(h.messages.at(-1), /Wait for your browser/);
  assert.equal(h.controller.hasPrompt(), false); assert.equal(h.states.at(-1).pending, false);
});
test('dismissal does not auto-open instructions and a fresh browser event can be retried', async () => {
  const h = harness(); h.offer(() => Promise.resolve({ outcome: 'dismissed' }));
  await h.controller.install(); assert.match(h.messages.at(-1), /Nothing was marked installed/);
  assert.equal(h.counts().help, 0); assert.equal(h.counts().installed, 0);
  h.offer(() => Promise.resolve({ outcome: 'accepted' })); assert.equal(h.controller.hasPrompt(), true);
  await h.controller.install(); assert.equal(h.counts().requested, 2);
});
test('prompt failure leaves recovery help explicit, with no silent success', async () => {
  const h = harness(); h.offer(() => { throw new Error('NotAllowedError'); });
  await h.controller.install(); assert.match(h.messages.at(-1), /could not open/);
  assert.equal(h.counts().help, 0); assert.equal(h.counts().installed, 0);
  await h.controller.install(); assert.equal(h.counts().help, 1);
});
test('trusted installation clears stale prompt and wins over a late choice response', async () => {
  const h = harness(); let resolve;
  h.offer(() => new Promise(r => { resolve = r; })); const action = h.controller.install();
  h.listeners.appinstalled({ isTrusted: false }); assert.equal(h.counts().installed, 0);
  h.listeners.appinstalled({ isTrusted: true }); resolve({ outcome: 'accepted' }); await action;
  assert.equal(h.counts().installed, 1); assert.match(h.messages.at(-1), /browser reported installation/);
  assert.equal(h.states.at(-1).observed, true); await h.controller.install(); assert.equal(h.counts().requested, 1);
});
test('legacy prompt implementations can return choice through userChoice', async () => {
  const h = harness(); h.listeners.beforeinstallprompt({ preventDefault() {}, prompt: async () => undefined, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  await h.controller.install(); assert.match(h.messages.at(-1), /not confirmed/);
});
