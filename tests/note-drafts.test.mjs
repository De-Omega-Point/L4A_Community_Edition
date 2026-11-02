import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as state from '../public/community/js/state.js';
import * as rewards from '../public/community/js/rewards.js';
import * as crm from '../public/community/js/crm.js';
import * as ui from '../public/community/js/ui.js';
import { renderMemberDashboard } from '../public/community/js/member-dashboard.js';
import * as notes from '../public/community/js/note-drafts.js';
import { renderCardPreviewForCustomer } from '../public/community/js/cards.js';
import { defaultBranding } from '../public/community/js/data-schema.js';
import { WORKSPACE_KEY } from '../public/community/js/storage.js';
import { escapeHtml } from '../public/community/js/utils.js';
import { memoryStorage, installLocks, installDom } from './helpers/local-storage.mjs';

const appSource = readFileSync('public/community/js/app.js', 'utf8');
const eventCode = appSource.slice(appSource.indexOf('function bindSavedAction'), appSource.indexOf('function registerServiceWorker'));
const customer = (id, name) => ({ id, name, token: `CUST-${id.toUpperCase()}`, visits: 1, points: 20, notes: [], redemptions: [], surpriseRewards: [], createdAt: '2026-09-01T00:00:00.000Z' });
const { appState } = state;

async function harness() {
  globalThis.localStorage = memoryStorage();
  globalThis.indexedDB = undefined;
  installLocks();
  const element = installDom();
  document.getElementById = id => {
    const item = element(id);
    item.listeners ||= new Map();
    item.addEventListener = (type, listener) => {
      if (!item.listeners.has(type)) item.listeners.set(type, []);
      item.listeners.get(type).push(listener);
    };
    return item;
  };
  document.addEventListener = () => {};
  const windowListeners = new Map();
  window.addEventListener = (type, listener) => {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(listener);
  };
  window.dispatchEvent = event => { for (const listener of windowListeners.get(event.type) || []) listener(event); };
  window.scrollTo = () => {};
  appState.currentCustomerId = appState.selectedCrmCustomerId = null;
  await state.loadData();
  await state.restoreBackup({ schemaVersion: 7, customers: [customer('alex', 'Alex'), customer('blair', 'Blair')], activity: [], branding: defaultBranding });
  const noop = () => {};
  const app = { ...state, ...rewards, ...crm, ...ui, ...notes, document, window, navigator,
    renderMemberDashboard, renderCardPreviewForCustomer, escapeHtml, stopCameraScanner: noop, refreshBrandDraftPreview: noop,
    exportData: noop, exportCustomersCsv: noop, importData: noop };
  vm.createContext(app);
  vm.runInContext(eventCode, app);
  app.bindEvents();
  ui.renderAll();
  const fire = (id, type = 'click') => Promise.all((element(id).listeners.get(type) || []).map(listener => listener({ target: element(id) })));
  const type = (id, text) => { assert.equal(element(id).disabled, false); element(id).value = text; return fire(id, 'input'); };
  const durable = id => JSON.parse(localStorage.getItem(WORKSPACE_KEY)).snapshot.customers.find(item => item.id === id);
  return { app, element, fire, type, durable, selectCounter: id => app.selectCounterCustomer(state.getCustomerById(id)) };
}

function delayNextWrite() {
  const original = navigator.locks.request;
  let resolve, reject, started;
  const ready = new Promise(done => { started = done; });
  const gate = new Promise((done, fail) => { resolve = done; reject = fail; });
  navigator.locks.request = (key, callback) => {
    navigator.locks.request = original;
    started();
    return gate.then(() => original(key, callback));
  };
  return { ready, resolve, reject };
}

const surfaces = [
  { name: 'Counter', input: 'counterNote', button: 'btnAddNote', notice: 'counterNotice', select: (h, id) => h.selectCounter(id), clear: h => h.fire('btnClearCustomer') },
  { name: 'CRM profile', input: 'profileNote', button: 'btnAddProfileNote', notice: 'customerFormNotice', select: (_h, id) => crm.selectCrmCustomer(id), clear: h => h.fire('btnResetCustomer') }
];

for (const surface of surfaces) {
  const { name, input, button, notice, select, clear } = surface;
  test(`${name}: customer switches and Clear/New cannot reattribute an unfinished note`, async () => {
    const h = await harness();
    assert.equal(h.element(input).disabled, true);
    await h.fire(button);
    select(h, 'alex');
    await h.type(input, 'Only for Alex');
    select(h, 'blair');
    assert.equal(h.element(input).value, '');
    assert.match(h.element(`${input}Help`).textContent, /Note for Blair.*Unsaved notes clear/);
    await h.fire(button);
    assert.equal(h.durable('blair').notes.length, 0);
    select(h, 'alex'); await h.type(input, 'Another Alex draft'); await clear(h);
    assert.equal(h.element(input).value, ''); assert.equal(h.element(input).disabled, true);
    select(h, 'blair'); await h.fire(button);
    assert.equal(h.durable('alex').notes.length, 0); assert.equal(h.durable('blair').notes.length, 0);
    await h.type(input, 'Only for Blair'); await h.fire(button);
    assert.deepEqual(h.durable('blair').notes.map(note => note.text), ['Only for Blair']);
    assert.equal(h.element(input).value, ''); assert.match(h.element(notice).textContent, /Blair: private note saved/);
  });

  test(`${name}: redraws, same-customer selection and screen navigation retain a draft`, async () => {
    const h = await harness();
    select(h, 'alex'); await h.type(input, 'Keep this draft');
    ui.renderAll(); select(h, 'alex'); ui.showScreen('settings'); ui.showScreen('counter'); ui.showScreen('customers');
    await rewards.addVisit('alex'); ui.renderAll();
    assert.equal(h.element(input).value, 'Keep this draft');
    await h.fire(button);
    assert.deepEqual(h.durable('alex').notes.map(note => note.text), ['Keep this draft']);
  });

  test(`${name}: delayed success saves to its original owner once and keeps the newer customer's draft`, async () => {
    const h = await harness();
    select(h, 'alex'); await h.type(input, 'Original Alex note');
    const delay = delayNextWrite(); const saving = h.fire(button); await delay.ready;
    assert.equal(h.element(button).disabled, true);
    await h.fire(button);
    select(h, 'blair'); await h.type(input, 'New Blair draft');
    delay.resolve(); await saving;
    assert.deepEqual(h.durable('alex').notes.map(note => note.text), ['Original Alex note']);
    assert.equal(h.durable('blair').notes.length, 0);
    assert.equal(h.element(input).value, 'New Blair draft'); assert.equal(h.element(button).disabled, false);
    assert.match(h.element(notice).textContent, /Alex: private note saved/);
    await h.fire(button);
    assert.deepEqual(h.durable('blair').notes.map(note => note.text), ['New Blair draft']);
  });

  for (const change of ['edit back to identical text', 'switch away and back', 'clear and reselect']) {
    test(`${name}: delayed success cannot clear a newer draft after ${change}`, async () => {
      const h = await harness();
      select(h, 'alex'); await h.type(input, 'Same text');
      const delay = delayNextWrite(); const saving = h.fire(button); await delay.ready;
      if (change === 'switch away and back') { select(h, 'blair'); select(h, 'alex'); }
      else if (change === 'clear and reselect') { await clear(h); select(h, 'alex'); }
      else await h.type(input, 'Changed temporarily');
      await h.type(input, 'Same text');
      delay.resolve(); await saving;
      assert.equal(h.element(input).value, 'Same text');
      assert.deepEqual(h.durable('alex').notes.map(note => note.text), ['Same text']);
      assert.equal(h.durable('blair').notes.length, 0);
    });
  }

  test(`${name}: delayed failure retains the original draft for retry without duplication`, async () => {
    const h = await harness();
    select(h, 'alex'); await h.type(input, 'Retry this Alex note');
    const delay = delayNextWrite(); const saving = h.fire(button); await delay.ready;
    delay.reject(new Error('Synthetic storage failure')); await saving;
    assert.equal(h.durable('alex').notes.length, 0); assert.equal(h.element(input).value, 'Retry this Alex note');
    assert.equal(h.element(button).disabled, false); assert.match(h.element(notice).textContent, /Alex: note could not be saved.*Synthetic storage failure/);
    await h.fire(button);
    assert.deepEqual(h.durable('alex').notes.map(note => note.text), ['Retry this Alex note']);
  });

  test(`${name}: delayed failure never restores an old note into the new customer's draft`, async () => {
    const h = await harness();
    select(h, 'alex'); await h.type(input, 'Failed Alex note');
    const delay = delayNextWrite(); const saving = h.fire(button); await delay.ready;
    select(h, 'blair'); await h.type(input, 'Keep Blair draft');
    delay.reject(new Error('Synthetic storage failure')); await saving;
    assert.equal(h.durable('alex').notes.length, 0); assert.equal(h.durable('blair').notes.length, 0);
    assert.equal(h.element(input).value, 'Keep Blair draft'); assert.match(h.element(notice).textContent, /Alex: note could not be saved/);
    await h.fire(button);
    assert.deepEqual(h.durable('blair').notes.map(note => note.text), ['Keep Blair draft']);
  });
}

test('Counter: scanned, quick-selected, invalid and manually searched customers cannot inherit the prior draft', async () => {
  const h = await harness();
  for (const transition of [
    async () => { h.element('scanInput').value = 'CUST-BLAIR'; await h.fire('btnHandleScan'); },
    async () => window.dispatchEvent(new CustomEvent('lfa:customer-scanned', { detail: { customerId: 'blair' } })),
    async () => window.dispatchEvent(new CustomEvent('lfa:quick-customer', { detail: { customerId: 'blair' } })),
    async () => { h.element('scanInput').value = 'Blair'; await h.fire('scanInput', 'input'); await h.fire('btnHandleScan'); },
    async () => { h.element('scanInput').value = 'not-a-customer'; await h.fire('btnHandleScan'); h.selectCounter('blair'); }
  ]) {
    h.selectCounter('alex'); await h.type('counterNote', 'Do not move Alex note');
    await transition(); await h.fire('btnAddNote');
    assert.equal(h.element('counterNote').value, ''); assert.equal(h.durable('blair').notes.length, 0);
  }
});

test('Counter and CRM drafts have independent owners; saving one never clears the other', async () => {
  const h = await harness();
  h.selectCounter('alex'); crm.selectCrmCustomer('blair');
  await h.type('counterNote', 'Counter Alex'); await h.type('profileNote', 'Profile Blair');
  await h.fire('btnAddNote'); assert.equal(h.element('profileNote').value, 'Profile Blair');
  await h.fire('btnAddProfileNote');
  assert.deepEqual(h.durable('alex').notes.map(note => note.text), ['Counter Alex']);
  assert.deepEqual(h.durable('blair').notes.map(note => note.text), ['Profile Blair']);
});

test('a direct selection change cannot bypass ownership checks or claim an unowned draft', async () => {
  const h = await harness();
  h.element('counterNote').value = 'Unowned restored text'; h.selectCounter('alex');
  assert.equal(h.element('counterNote').value, '');
  await h.type('counterNote', 'Owned by Alex'); appState.currentCustomerId = 'blair';
  await h.fire('btnAddNote'); assert.equal(h.durable('blair').notes.length, 0);
  crm.selectCrmCustomer('alex'); await h.type('profileNote', 'Profile Alex'); appState.selectedCrmCustomerId = 'blair';
  await h.fire('btnAddProfileNote'); assert.equal(h.durable('blair').notes.length, 0);
});

test('saving a different customer synchronizes counter draft ownership immediately', async () => {
  const h = await harness();
  h.selectCounter('alex'); await h.type('counterNote', 'Alex draft'); crm.selectCrmCustomer('blair');
  await h.fire('btnSaveCustomer');
  assert.equal(appState.currentCustomerId, 'blair'); assert.equal(h.element('counterNote').value, '');
  assert.match(h.element('counterNoteHelp').textContent, /Note for Blair/);
  await h.fire('btnAddNote'); assert.equal(h.durable('blair').notes.length, 0);
});

test('note ownership help is accessible and the versioned offline shell includes the helper', () => {
  const html = readFileSync('public/community/index.html', 'utf8');
  for (const { input } of surfaces) {
    assert.match(html, new RegExp(`id="${input}"[^>]*aria-describedby="${input}Help"[^>]*disabled`));
    assert.match(html, new RegExp(`id="${input}Help"[^>]*>Select a customer before writing a note\\. Unsaved notes clear when you change customers\\.`));
  }
  const worker = readFileSync('public/community/service-worker.js', 'utf8');
  assert.match(worker, /CACHE_PREFIX}v32/); assert.match(worker, /'\.\/js\/note-drafts\.js'/);
});
