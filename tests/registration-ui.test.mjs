import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createInstallController } from '../public/community/js/install-controller.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { bindRegistrationLifecycle, createRegistrationFlow, registrationPayload, registrationWelcomePath } from '../app/register/registration-flow.mjs';
import { createAcquisitionReporter, observeAppInstallation } from '../public/community/js/acquisition.js';

const productId = '5da5ac2a-3f0f-4b21-9c53-c4599aefcb21';
const ready = { cookieReady: true, registered: false, productId: null };
const saved = { cookieReady: true, registered: true, productId };
const input = { noticeVersion: '2026-10-28-registration-3', kind: 'individual', contactName: 'Synthetic Person', email: 'test@example.test', termsAccepted: true, privacyAcknowledged: true, marketingConsent: false };
const json = (body, status = 200) => Response.json(body, { status });
const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };

function harness(t, replies, options = {}) {
  const calls = [], changes = [];
  const flow = createRegistrationFlow({
    fetcher: async (url, init) => {
      calls.push({ url, ...init });
      assert(replies.length, 'Unexpected network request');
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      return typeof reply === 'function' ? reply(init) : reply;
    },
    onChange: state => changes.push({ ...state }), ...options
  });
  t.after(() => flow.dispose());
  return { flow, calls, changes };
}

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    dispatch(type, extra = {}) { for (const handler of listeners.get(type) || []) handler({ type, ...extra }); },
    count(type) { return listeners.get(type)?.size || 0; }
  };
}

function formData(kind = 'individual') {
  const data = new FormData();
  for (const [name, value] of Object.entries({ noticeVersion: '2026-10-28-registration-3', kind, contactName: ' Synthetic Person ', businessName: ' Synthetic Shop ', email: ' test@example.test ', termsAccepted: 'on', privacyAcknowledged: 'on', unexpected: 'never sent' })) data.set(name, value);
  return data;
}

test('browser payload includes only the exact registration fields and optional consent defaults false', () => {
  assert.deepEqual(registrationPayload(formData()), input);
  const data = formData('business');
  data.set('marketingConsent', 'on');
  assert.deepEqual(registrationPayload(data), { ...input, kind: 'business', businessName: 'Synthetic Shop', marketingConsent: true });
  data.delete('termsAccepted'); data.delete('privacyAcknowledged');
  assert.equal(registrationPayload(data).termsAccepted, false);
  assert.equal(registrationPayload(data).privacyAcknowledged, false);
});

test('first response must be followed by proof that the HttpOnly cookie returned', async t => {
  const h = harness(t, [json({ ...ready, cookieReady: false }), json(ready)]);
  await h.flow.check();
  assert.equal(h.flow.getState().phase, 'ready');
  assert.equal(h.calls.length, 2);
  for (const call of h.calls) {
    assert.equal(call.url, '/api/registrations');
    assert.equal(call.method, 'GET');
    assert.equal(call.credentials, 'same-origin');
    assert.equal(call.cache, 'no-store');
    assert.equal(call.referrerPolicy, 'no-referrer');
    assert.equal(call.body, undefined);
    assert.equal(call.headers.Cookie, undefined);
    assert.equal(call.headers.Authorization, undefined);
  }
});

test('blocked cookies cannot enable submission, and checking can recover after cookies are allowed', async t => {
  const h = harness(t, [json({ ...ready, cookieReady: false }), json({ ...ready, cookieReady: false }), json(ready)]);
  await h.flow.check();
  assert.equal(h.flow.getState().phase, 'error');
  assert.match(h.flow.getState().message, /Allow site cookies/);
  await h.flow.submit(input);
  assert.equal(h.calls.length, 2);
  await h.flow.check();
  assert.equal(h.flow.getState().phase, 'ready');
});

test('failed or malformed initial checks stay disabled without sending details', async t => {
  for (const bad of [new Error('Offline'), json({ unexpected: true }), json({ ...saved, productId: '' }), json({ message: 'Unavailable' }, 503)]) {
    const h = harness(t, [bad, json(ready)]);
    await h.flow.check();
    assert.equal(h.flow.getState().phase, 'error');
    await h.flow.submit(input);
    assert.equal(h.calls.length, 1);
    await h.flow.check();
    assert.equal(h.flow.getState().phase, 'ready');
  }
});

test('an existing registration shows the server Product ID without re-submitting identity', async t => {
  const h = harness(t, [json(saved)]);
  await h.flow.check();
  assert.equal(h.flow.getState().phase, 'saved');
  assert.equal(h.flow.getState().productId, productId);
  assert.equal(h.flow.getState().existing, true);
  await h.flow.submit(input);
  assert.equal(h.calls.length, 1);
});

test('repeated checks and repeated save clicks produce just one in-flight request', async t => {
  const checking = deferred(), saving = deferred();
  const h = harness(t, [() => checking.promise, () => saving.promise]);
  const firstCheck = h.flow.check();
  await h.flow.check(); await h.flow.submit(input);
  assert.equal(h.calls.length, 1);
  checking.resolve(json(ready)); await firstCheck;
  const firstSave = h.flow.submit(input);
  assert.equal(h.flow.getState().phase, 'saving');
  await h.flow.submit(input); await h.flow.check();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(JSON.parse(h.calls[1].body), input);
  saving.resolve(json({ registered: true, productId, created: true }, 201)); await firstSave;
  assert.equal(h.flow.getState().phase, 'saved');
  assert.equal(h.flow.getState().existing, false);
  await h.flow.submit(input);
  assert.equal(h.calls.length, 2);
});

test('lost save response checks status before any retry and recovers an already committed registration', async t => {
  const h = harness(t, [json(ready), new Error('Connection ended'), json(saved)]);
  await h.flow.check(); await h.flow.submit(input);
  assert.equal(h.flow.getState().phase, 'uncertain');
  await h.flow.submit(input);
  assert.equal(h.calls.length, 2);
  await h.flow.check();
  assert.equal(h.flow.getState().phase, 'saved');
  assert.deepEqual(h.calls.map(call => call.method), ['GET', 'POST', 'GET']);
});

test('an uncertain save never auto-resubmits after status confirms no record', async t => {
  const h = harness(t, [json(ready), json({ message: 'Service unavailable' }, 503), json(ready), json({ registered: true, productId, created: true })]);
  await h.flow.check(); await h.flow.submit(input); await h.flow.check();
  assert.equal(h.flow.getState().phase, 'ready');
  assert.match(h.flow.getState().message, /Review your details/);
  assert.deepEqual(h.calls.map(call => call.method), ['GET', 'POST', 'GET']);
  await h.flow.submit(input);
  assert.equal(h.flow.getState().phase, 'saved');
});

test('a failed recovery check does not reopen submission; another GET can recover', async t => {
  const h = harness(t, [json(ready), new Error('Lost response'), new Error('Still offline'), json(saved)]);
  await h.flow.check(); await h.flow.submit(input); await h.flow.check();
  assert.equal(h.flow.getState().phase, 'error');
  await h.flow.submit(input);
  assert.equal(h.calls.length, 3);
  await h.flow.check();
  assert.equal(h.flow.getState().phase, 'saved');
});

test('definitive validation errors keep form details editable without claiming success', async t => {
  const h = harness(t, [json(ready), json({ code: 'invalid_input', message: 'Enter your name.' }, 400), json({ registered: true, productId, created: false })]);
  await h.flow.check(); await h.flow.submit(input);
  assert.equal(h.flow.getState().phase, 'ready');
  assert.equal(h.flow.getState().message, 'Enter your name.');
  await h.flow.submit(input);
  assert.equal(h.flow.getState().phase, 'saved');
  assert.equal(h.flow.getState().existing, true);
});

test('a malformed save response is uncertain, not a successful registration', async t => {
  const h = harness(t, [json(ready), json({ registered: true }), json(saved)]);
  await h.flow.check(); await h.flow.submit(input);
  assert.equal(h.flow.getState().phase, 'uncertain');
  assert.equal(h.flow.getState().productId, null);
  await h.flow.check();
  assert.equal(h.flow.getState().productId, productId);
});

test('unmount aborts unfinished work and late results cannot update the old UI', async t => {
  const saving = deferred();
  const h = harness(t, [json(ready), () => saving.promise]);
  await h.flow.check(); const pending = h.flow.submit(input);
  h.flow.dispose();
  assert.equal(h.calls[1].signal.aborted, true);
  const count = h.changes.length;
  saving.resolve(json({ registered: true, productId })); await pending;
  assert.equal(h.changes.length, count);
  await h.flow.check(); await h.flow.submit(input);
  assert.equal(h.calls.length, 2);
  const returned = harness(t, [json(saved)]);
  await returned.flow.check();
  assert.equal(returned.flow.getState().phase, 'saved');
});

test('Back/Forward-cache restoration checks status and ignores interrupted, late save results', async t => {
  const saving = deferred(), checking = deferred();
  const h = harness(t, [json(ready), () => saving.promise, () => checking.promise]);
  const target = eventTarget();
  const cleanup = bindRegistrationLifecycle(h.flow, target);
  t.after(cleanup);
  await h.flow.check(); const pending = h.flow.submit(input);
  target.dispatch('pagehide');
  assert.equal(h.calls[1].signal.aborted, true);
  assert.equal(h.flow.getState().phase, 'paused');
  target.dispatch('pageshow', { persisted: true });
  assert.equal(h.flow.getState().phase, 'checking');
  assert.equal(h.calls[2].method, 'GET');
  saving.resolve(json({ registered: true, productId: 'stale-result' })); await pending;
  assert.equal(h.flow.getState().phase, 'checking');
  checking.resolve(json(saved));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.flow.getState().productId, productId);
  cleanup();
  assert.equal(target.count('pageshow'), 0);
  assert.equal(target.count('pagehide'), 0);
});

test('a stalled save is bounded and requires a status check after timeout', async t => {
  const h = harness(t, [json(ready), init => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('Timed out')), { once: true });
  })], { timeoutMs: 10 });
  await h.flow.check(); await h.flow.submit(input);
  assert.equal(h.calls[1].signal.aborted, true);
  assert.equal(h.flow.getState().phase, 'uncertain');
});

const formSource = readFileSync(new URL('../app/register/registration-form.tsx', import.meta.url), 'utf8');
async function renderForm() {
  let output = ts.transpileModule(formSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const name of ['react', 'react/jsx-runtime']) {
    output = output.replaceAll(`from '${name}'`, `from ${JSON.stringify(import.meta.resolve(name))}`).replaceAll(`from "${name}"`, `from ${JSON.stringify(import.meta.resolve(name))}`);
  }
  output = output.replaceAll("'./registration-flow.mjs'", JSON.stringify(new URL('../app/register/registration-flow.mjs', import.meta.url).href));
  const { default: Component } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
  return renderToStaticMarkup(createElement(Component));
}

test('rendered form requires names/email/legal acknowledgements but never prechecks marketing consent', async () => {
  const html = await renderForm();
  assert.match(html, /<fieldset disabled=""/);
  for (const name of ['contactName', 'businessName', 'email', 'termsAccepted', 'privacyAcknowledged']) {
    const tag = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0];
    assert(tag, name); assert.match(tag, /required=""/);
  }
  const marketing = html.match(/<input[^>]*name="marketingConsent"[^>]*>/)?.[0];
  assert(marketing);
  assert.doesNotMatch(marketing, /\b(required|checked)=/);
  assert.match(html, /Optional/);
  assert.match(html, /not verified/);
  assert.match(html, /href="\/registration\/notices\/2026-10-28-registration-3\/terms.html"/);
  assert.match(html, /href="\/registration\/notices\/2026-10-28-registration-3\/privacy.html"/);
  assert.match(formSource, /hidden=\{kind !== 'business'\}/);
  assert.match(formSource, /required=\{kind === 'business'\}/);
  assert.match(formSource, /href="\/community\/welcome">Return to welcome page/);
});

test('registration UI has no client receipt, persistent auth flag, generated ID, or verification promise', () => {
  const flow = readFileSync(new URL('../app/register/registration-flow.mjs', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../app/register/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(`${flow}\n${formSource}\n${page}`, /localStorage|sessionStorage|document\.cookie|randomUUID|emailVerified|Continue to email verification/);
});

test('acquisition sends only one allowlisted event per lifecycle with same-origin cookie authentication', async () => {
  const calls = [];
  const report = createAcquisitionReporter({ fetcher: async (url, init) => { calls.push({ url, ...init }); return json({ recorded: true }); } });
  assert.equal(await report('customer_saved'), false);
  for (const event of ['app_opened', 'install_requested', 'install_observed']) {
    assert.equal(await report(event), true);
    assert.equal(await report(event), false);
  }
  assert.equal(calls.length, 3);
  calls.forEach((call, index) => {
    assert.equal(call.url, '/api/registration-events');
    assert.equal(call.method, 'POST');
    assert.equal(call.credentials, 'same-origin');
    assert.equal(call.referrerPolicy, 'no-referrer');
    assert.equal(call.redirect, 'error');
    assert.equal(call.cache, 'no-store');
    assert.deepEqual(JSON.parse(call.body), { event: ['app_opened', 'install_requested', 'install_observed'][index] });
    assert.deepEqual(call.headers, { 'Content-Type': 'application/json' });
  });
});

test('acquisition failure, absent registration and offline mode are best-effort with no queue or automatic retry', async () => {
  for (const response of [new Error('Offline'), json({ code: 'registration_required' }, 403)]) {
    let calls = 0;
    const report = createAcquisitionReporter({ fetcher: async () => { calls += 1; if (response instanceof Error) throw response; return response; } });
    assert.equal(await report('app_opened'), false);
    assert.equal(await report('app_opened'), false);
    assert.equal(calls, 1);
  }
  let online = false, calls = 0;
  const report = createAcquisitionReporter({ isOnline: () => online, fetcher: async () => { calls += 1; return json({ recorded: true }); } });
  assert.equal(await report('app_opened'), false);
  online = true;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
});

test('install observation comes only from a trusted browser appinstalled event, and listeners can be removed', () => {
  const target = eventTarget(), events = [];
  const remove = observeAppInstallation(target, event => events.push(event));
  target.dispatch('beforeinstallprompt', { isTrusted: true });
  target.dispatch('appinstalled', { isTrusted: false });
  assert.deepEqual(events, []);
  target.dispatch('appinstalled', { isTrusted: true });
  assert.deepEqual(events, ['install_observed']);
  remove();
  target.dispatch('appinstalled', { isTrusted: true });
  assert.equal(events.length, 1);
});

const appSource = readFileSync(new URL('../public/community/js/app.js', import.meta.url), 'utf8');

test('existing manual and native install flows still work; prompt acceptance is not observed installation', async () => {
  const target = eventTarget(), nodes = new Map(), events = [];
  let dialogOpen = false, promptCalled = false;
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, { ...eventTarget(), hidden: false, textContent: '', showModal() { dialogOpen = true; }, close() { dialogOpen = false; } });
    return nodes.get(id);
  };
  const context = {
    window: { ...target, matchMedia: () => ({ matches: false }), navigator: {} },
    navigator: { userAgent: 'Synthetic desktop' }, sessionStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: element },
    recordAcquisitionEvent: event => events.push(event), observeAppInstallation, mountInstallGuidance: () => ({ render() {} })
  };
  context.createInstallController = options => createInstallController({ ...options, target: context.window });
  vm.createContext(context);
  vm.runInContext(appSource.slice(appSource.indexOf('let installGuidance'), appSource.indexOf('function backupFilename')), context);
  context.bindInstallExperience();
  await context.installApp();
  assert.equal(dialogOpen, true);
  assert.deepEqual(events, []);
  element('btnCloseInstallDialog').dispatch('click');
  assert.equal(dialogOpen, false);
  target.dispatch('beforeinstallprompt', { preventDefault() {}, prompt() { promptCalled = true; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  await context.installApp();
  assert.equal(promptCalled, true);
  assert.equal(element('installBanner').hidden, false);
  assert.deepEqual(events, ['install_requested']);
  let release; let calls=0;
  target.dispatch('beforeinstallprompt', { preventDefault() {}, prompt() { calls++; }, userChoice: new Promise(resolve => { release=resolve; }) });
  const first=context.installApp(); await context.installApp(); assert.equal(calls,1); release({outcome:'dismissed'}); await first;
  target.dispatch('beforeinstallprompt', { preventDefault() {}, prompt() { throw new Error('unsupported'); }, userChoice: Promise.resolve({outcome:'dismissed'}) });
  await context.installApp(); assert.equal(dialogOpen,false);
  assert.match(element('installActionStatus').textContent, /could not open/);
  assert.equal(element('btnInstallFirst').disabled, false);
  target.dispatch('appinstalled', { isTrusted: true });
  assert.equal(element('installBanner').hidden, true);
  assert.equal(element('btnInstallFirst').disabled, true);
});

test('app_opened is reported only after successful app initialization, never after a failed load', async () => {
  const source = appSource.slice(appSource.indexOf('async function init()'), appSource.indexOf('void init().catch'));
  for (const fail of [false, true]) {
    const actions = [];
    const noop = () => {};
    const context = {
      registerServiceWorker: noop, bindInstallExperience: noop, mountRegisteredProduct: noop, mountInstallFirst: noop, mountUninstallGuidance: noop,
      loadData: async () => { if (fail) throw new Error('Load failed'); actions.push('loaded'); },
      loadBranding: async () => {}, buildNav: noop, bindEvents: noop, bindMembership: noop,
      updateBackupStatus: noop, updateStorageProtection: noop, renderAll: () => actions.push('rendered'),
      appState: { customers: [], activity: [] }, exportData: noop, exportCustomersCsv: noop, installApp: noop, toast: noop, recordAcquisitionEvent: event => actions.push(event)
    };
    vm.createContext(context); vm.runInContext(source, context);
    if (fail) { await assert.rejects(context.init(), /Load failed/); assert.deepEqual(actions, []); }
    else { await context.init(); assert.deepEqual(actions, ['loaded', 'rendered', 'app_opened']); }
  }
});


test('duplicate-review refusal shows safe guidance without claiming saved identity or retrying POST', async t => {
 const message='We could not create a new registration with these details. Use your original browser or contact support.';
 const h=harness(t,[json(ready),json({code:'registration_review_needed',message},409)]);
 await h.flow.check();await h.flow.submit(input);
 assert.equal(h.flow.getState().phase,'ready');assert.equal(h.flow.getState().productId,null);
 assert.equal(h.flow.getState().message,message);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
});


test('successful registration returns to same-origin welcome and preserves installed scope', () => {
 assert.equal(registrationWelcomePath('/register'),'/');
 assert.equal(registrationWelcomePath('/community/register'),'/community/welcome');
 assert.equal(registrationWelcomePath('/community/register/'),'/community/welcome');
 assert.match(formSource,/state.phase === 'saved'.*window.location.replace/);
 assert.match(formSource,/registrationWelcomePath\(window.location.pathname\)/);
});
