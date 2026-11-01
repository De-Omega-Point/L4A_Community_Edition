import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as state from '../public/community/js/state.js';
import * as rewards from '../public/community/js/rewards.js';
import * as crm from '../public/community/js/crm.js';
import { defaultBranding, normaliseBackup, MAX_BACKUP_BYTES } from '../public/community/js/data-schema.js';
import { csvCell } from '../public/community/js/utils.js';
import { captureNoteDraft, clearSavedNoteDraft, setNoteDraftCustomer } from '../public/community/js/note-drafts.js';
import { commitWorkspace, readWorkspace, WORKSPACE_KEY, WORKSPACE_RECORD } from '../public/community/js/storage.js';
import { memoryStorage, installLocks, installDom, memoryIndexedDB } from './helpers/local-storage.mjs';
const { appState, storageKeys } = state;
const customer = (id = 'customer_a', extra = {}) => ({ id, name: `Synthetic ${id}`, token: `CUST-${id.toUpperCase()}`, visits: 1, points: 20, notes: [], redemptions: [], surpriseRewards: [], createdAt: '2026-09-01T00:00:00.000Z', ...extra });
const backup = (customers = [customer()], branding = {}) => ({ schemaVersion: 5, customers, activity: [], branding: { ...defaultBranding, businessName: 'Synthetic Merchant', ...branding } });
async function setup({ seed = true, database = false, beforeLoad } = {}) {
  globalThis.localStorage = memoryStorage(); installLocks();
  const element = installDom();
  const idb = database ? memoryIndexedDB() : null;
  globalThis.indexedDB = idb?.api;
  appState.currentCustomerId = appState.selectedCrmCustomerId = null;
  if (beforeLoad) beforeLoad(localStorage, idb);
  await state.loadData();
  if (seed) await state.restoreBackup(backup());
  return { storage: localStorage, element, idb };
}
function durable(storage = localStorage) { return JSON.parse(storage.getItem(WORKSPACE_KEY)); }
function failWrites(storage) { const original = storage.setItem; storage.setItem = () => { throw new DOMException('Synthetic quota', 'QuotaExceededError'); }; return () => { storage.setItem = original; }; }

test('new local identity matches the optional membership API and empty imported identity cannot erase it', async () => {
  await setup({ seed: false });
  const id = appState.branding.productId;
  assert.match(id, /^LFA-LOCAL-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
  await state.restoreBackup(backup());
  assert.equal(appState.branding.productId, id);
  await state.loadData(); assert.equal(appState.branding.productId, id);
});
for (const version of [3, 4, 5]) test(`migrates v${version} customers, branding and CE identity in one envelope`, async () => {
  const dataKey = version === 5 ? storageKeys.data : version === 4 ? storageKeys.legacyData : storageKeys.olderLegacyData;
  const brandKey = version === 5 ? storageKeys.branding : version === 4 ? storageKeys.legacyBranding : storageKeys.olderLegacyBranding;
  await setup({ seed: false, beforeLoad(storage) {
    storage.setItem(dataKey, JSON.stringify({ schemaVersion: version === 5 ? 6 : version, customers: [customer()], activity: [] }));
    storage.setItem(brandKey, JSON.stringify({ ...defaultBranding, businessName: 'Legacy merchant', productId: 'LFA-CE-23456789', pointsPerVisit: 2.5, brandLogo: '/assets/merchant.png' }));
  } });
  assert.equal(appState.branding.businessName, 'Legacy merchant');
  assert.equal(appState.branding.productId, 'LFA-CE-23456789');
  assert.equal(appState.branding.pointsPerVisit, 2.5);
  assert.equal(durable().snapshot.customers.length, 1);
  assert.equal(durable().snapshot.branding.businessName, 'Legacy merchant');
});
test('corrupt newest legacy JSON does not hide a valid older copy; original bytes remain', async () => {
  const { storage } = await setup({ seed: false, beforeLoad(storage) {
    storage.setItem(storageKeys.data, '{broken');
    storage.setItem(storageKeys.legacyData, JSON.stringify(backup()));
  } });
  assert.equal(appState.customers.length, 1);
  assert.equal(storage.getItem(storageKeys.data), '{broken');
  assert.match(appState.storageWarning, /Recovered/);
});
test('unreadable branding never migrates defaults over readable customer data', async () => {
  const { storage } = await setup({ seed: false, beforeLoad(storage) {
    storage.setItem(storageKeys.data, JSON.stringify(backup()));
    const get = storage.getItem;
    storage.getItem = key => { if (key.includes('branding')) throw new Error('Synthetic inaccessible branding'); return get(key); };
  } });
  assert.equal(storage.getItem(WORKSPACE_KEY), null);
  assert.equal(state.storageStatus().readOnly, true);
  await assert.rejects(rewards.addVisit('customer_a'));
});
test('all-corrupt legacy data is not initialized as an empty merchant; explicit valid restore works', async () => {
  await setup({ seed: false, beforeLoad(storage) { storage.setItem(storageKeys.data, '{broken'); } });
  assert.equal(localStorage.getItem(WORKSPACE_KEY), null);
  await assert.rejects(rewards.addVisit('customer_a'));
  await state.restoreBackup(backup());
  assert.equal(appState.customers.length, 1);
  assert.equal(localStorage.getItem(storageKeys.data), '{broken');
});
test('corrupt canonical local JSON is preserved before explicit recovery', async () => {
  await setup({ seed: false, beforeLoad(storage) { storage.setItem(WORKSPACE_KEY, '{broken'); } });
  await assert.rejects(rewards.addVisit('customer_a'));
  await state.restoreBackup(backup());
  assert.equal(localStorage.getItem(`${WORKSPACE_KEY}.recovery`), '{broken');
  assert.equal(appState.customers.length, 1);
});
test('validation rejects malformed and ambiguous imports before touching storage', async () => {
  await setup();
  const previous = localStorage.getItem(WORKSPACE_KEY);
  const bad = [
    { ...backup(), activity: [null] }, { ...backup(), customers: [customer(), customer()] },
    backup([customer(), customer('other', { token: ' cust-customer_a ' })]),
    backup([customer('customer_a', { id: 'x" onpointerenter="alert(1)' })]),
    backup([customer('customer_a', { points: -1 })]), backup([customer('customer_a', { points: Infinity })]),
    backup([customer('customer_a', { visits: 1.5 })]), backup([customer('customer_a', { contactConsent: 'false' })]),
    backup([customer('customer_a', { notes: [null] })]), backup([customer('customer_a', { redemptions: 'wrong' })]),
    backup([customer('customer_a', { surpriseRewards: [{ id: 'x', description: {} }] })]),
    backup(undefined, { rewardThreshold: 0 }), backup(undefined, { brandLogo: 'javascript:alert(1)' }),
    { ...backup(), schemaVersion: 999 }, { ...backup(), activity: [{ id: 'a', customerId: 'customer_a', type: {}, at: 'bad' }] }
  ];
  for (const input of bad) assert.throws(() => state.restoreBackup(input), /Invalid backup/);
  assert.equal(localStorage.getItem(WORKSPACE_KEY), previous);
  assert.equal(appState.customers[0].name, 'Synthetic customer_a');
});
test('failed import keeps complete data-branding pair; successful backup round trip preserves nested records', async () => {
  const { storage } = await setup();
  const previous = JSON.stringify(state.serialisableState().customers);
  const before = storage.getItem(WORKSPACE_KEY);
  const restore = failWrites(storage);
  await assert.rejects(state.restoreBackup(backup([customer('other')], { businessName: 'Replacement' })));
  assert.equal(storage.getItem(WORKSPACE_KEY), before);
  assert.equal(JSON.stringify(appState.customers), previous);
  assert.equal(appState.branding.businessName, 'Synthetic Merchant');
  restore();
  const exported = state.serialisableState();
  await state.restoreBackup(exported);
  assert.deepEqual(state.serialisableState().customers, exported.customers);
});
test('failed reward is not visible or durable and retry deducts once', async () => {
  const { storage } = await setup();
  const before = storage.getItem(WORKSPACE_KEY);
  const restore = failWrites(storage);
  await assert.rejects(rewards.redeemReward('customer_a'));
  assert.equal(appState.customers[0].points, 20);
  assert.equal(appState.customers[0].redemptions.length, 0);
  assert.equal(storage.getItem(WORKSPACE_KEY), before);
  restore(); await rewards.redeemReward('customer_a'); await state.loadData();
  assert.equal(appState.customers[0].points, 10);
  assert.equal(appState.customers[0].redemptions.length, 1);
});
test('failed visit rolls back visit, points, activity and surprise draw; queued successful visits both survive', async () => {
  const { storage } = await setup();
  await state.saveBrandingState({ ...appState.branding, surpriseEnabled: true });
  const restore = failWrites(storage);
  await assert.rejects(rewards.addVisit('customer_a'));
  assert.equal(appState.customers[0].visits, 1);
  assert.equal(appState.customers[0].lastSurpriseRollDate, '');
  assert.equal(appState.activity.length, 0);
  restore(); await Promise.all([rewards.addVisit('customer_a'), rewards.addVisit('customer_a')]);
  assert.equal(appState.customers[0].visits, 3);
  assert.equal(appState.customers[0].points, 22);
  assert.equal(appState.activity.filter(a => a.type === 'visit').length, 2);
});
test('customer creation is complete or absent; form values and selected ID are captured before async storage', async () => {
  const { storage, element } = await setup();
  element('crmName').value = 'New synthetic customer'; element('crmToken').value = 'CUST-NEW';
  const restore = failWrites(storage);
  await assert.rejects(crm.saveCustomerFromForm());
  assert.equal(appState.customers.length, 1);
  restore();
  const pending = crm.saveCustomerFromForm();
  element('crmName').value = 'Newer draft'; appState.selectedCrmCustomerId = 'customer_a';
  const result = await pending;
  assert.equal(result.customer.name, 'New synthetic customer');
  assert.equal(appState.selectedCrmCustomerId, 'customer_a');
  assert.ok(durable().snapshot.customers.every(c => c.name));
});
test('duplicate customer codes are rejected on create and edit; deletion removes only matching history', async () => {
  const { element } = await setup();
  element('crmName').value = 'Other'; element('crmToken').value = 'cust-customer_a';
  await state.restoreBackup(backup([customer('a', { token: 'CUST-A' }), customer('b', { token: 'CUST-B' })]));
  element('crmToken').value = 'cust-a';
  assert.match((await crm.saveCustomerFromForm()).error, /already belongs/);
  appState.selectedCrmCustomerId = 'b';
  assert.match((await crm.saveCustomerFromForm()).error, /already belongs/);
  await rewards.addNote('Private A', 'a'); await rewards.addNote('Private B', 'b');
  appState.selectedCrmCustomerId = 'a';
  await crm.deleteSelectedCustomer();
  assert.equal(appState.customers.length, 1);
  assert.doesNotMatch(JSON.stringify(state.serialisableState()), /Private A/);
  assert.match(JSON.stringify(state.serialisableState()), /Private B/);
});
test('failed deletion keeps customer and history', async () => {
  const { storage } = await setup();
  await rewards.addNote('Keep this note', 'customer_a'); appState.selectedCrmCustomerId = 'customer_a';
  failWrites(storage);
  await assert.rejects(crm.deleteSelectedCustomer());
  assert.equal(appState.customers.length, 1);
  assert.match(JSON.stringify(appState.activity), /Keep this note/);
});
test('failed and empty scans clear selection; following actions cannot affect prior customer', async () => {
  await setup();
  assert.ok(rewards.handleScan('CUST-CUSTOMER_A'));
  assert.equal(rewards.handleScan('unknown'), null);
  assert.equal(appState.currentCustomerId, null);
  assert.equal(await rewards.addVisit(), null);
  rewards.handleScan('CUST-CUSTOMER_A'); rewards.handleScan('');
  assert.equal(await rewards.redeemReward(), null);
  assert.equal(appState.customers[0].visits, 1);
});
test('demo entry/exit failures preserve original and restoration point; import exits demo atomically', async () => {
  const { storage } = await setup();
  const restore = failWrites(storage);
  await assert.rejects(state.loadDemoData()); assert.equal(appState.demoMode, false);
  restore(); await state.loadDemoData();
  assert.equal(state.serialisableState().customers[0].id, 'customer_a');
  const before = storage.getItem(WORKSPACE_KEY); const recover = failWrites(storage);
  await assert.rejects(state.clearDemoData()); assert.equal(storage.getItem(WORKSPACE_KEY), before);
  recover(); await state.loadData(); assert.equal(appState.demoMode, true);
  await state.clearDemoData(); assert.equal(appState.customers[0].id, 'customer_a');
  await state.loadDemoData(); await state.restoreBackup(backup([customer('replacement')]));
  await state.clearDemoData(); assert.equal(appState.customers[0].id, 'replacement');
});
test('legacy active demo restores real customer and branding from its recovery point', async () => {
  await setup({ seed: false, beforeLoad(storage) {
    storage.setItem(storageKeys.data, JSON.stringify({ ...backup([customer('demo')]), demoMode: true }));
    storage.setItem(storageKeys.demoBackup, JSON.stringify(backup([customer('real')], { businessName: 'Real Merchant' })));
  } });
  await state.clearDemoData(); assert.equal(appState.customers[0].id, 'real'); assert.equal(appState.branding.businessName, 'Real Merchant');
});
test('two stale tabs cannot overwrite each other; conflict leaves second tab unmodified', async () => {
  await setup();
  const tabB = await import(`../public/community/js/state.js?tab=${Date.now()}`);
  await tabB.loadData();
  await state.restoreBackup(backup([customer(), customer('new_customer')]));
  await assert.rejects(tabB.updateState(draft => { draft.customers[0].points += 1; }), { code: 'STORAGE_CONFLICT' });
  assert.equal(durable().snapshot.customers.length, 2);
  assert.equal(tabB.appState.customers[0].points, 20);
});
test('additional activity preserves imported history and the last-visit fact', async () => {
  await setup(); await rewards.addVisit('customer_a');
  await state.updateState(draft => { for (let i = 0; i < 751; i++) state.addActivity(draft, 'note', 'unrelated', 'Synthetic'); });
  assert.equal(crm.crmStatus(appState.customers[0]).key, 'active');
  assert.ok(appState.activity.some(a => a.type === 'visit'));
  assert.equal(appState.activity.length, 752);
});
test('CSV formula prefixes including whitespace/control characters become literal text', () => {
  for (const value of ['=1+1', '+SUM(1,1)', '-1+1', '@SUM(1,1)', ' \t=1+1', '\r=1+1', '\nhello', '\ttext']) assert.ok(csvCell(value).startsWith('"\''), value);
  assert.equal(csvCell('Alice, "Smith"'), '"Alice, ""Smith"""');
  assert.equal(csvCell('ordinary text'), '"ordinary text"');
});
test('IDB commit succeeds even when optional localStorage mirror is full, without duplicate retry', async () => {
  const { storage, idb } = await setup({ database: true });
  failWrites(storage);
  await rewards.addVisit('customer_a');
  assert.equal(appState.customers[0].visits, 2);
  assert.equal(idb.records.get(WORKSPACE_RECORD).snapshot.customers[0].visits, 2);
  await state.loadData(); assert.equal(appState.customers[0].visits, 2);
});
test('IDB transaction abort after request success does not publish or mirror the change', async () => {
  const { storage, idb } = await setup({ database: true });
  const previous = storage.getItem(WORKSPACE_KEY); idb.failCommit = true;
  await assert.rejects(rewards.redeemReward('customer_a'), /Synthetic commit failure/);
  assert.equal(appState.customers[0].points, 20);
  assert.equal(idb.records.get(WORKSPACE_RECORD).snapshot.customers[0].points, 20);
  assert.equal(storage.getItem(WORKSPACE_KEY), previous);
});
test('IDB commit is awaited and compare-and-swap is atomic across concurrent writers', async () => {
  const { idb } = await setup({ database: true, seed: false });
  const current = idb.records.get(WORKSPACE_RECORD);
  const results = await Promise.allSettled([commitWorkspace(current.revision, { ...current.snapshot, branding: { ...current.snapshot.branding, businessName: 'A' } }), commitWorkspace(current.revision, { ...current.snapshot, branding: { ...current.snapshot.branding, businessName: 'B' } })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'STORAGE_CONFLICT');
});
test('IDB unavailability never silently writes to a potentially stale local mirror', async () => {
  const { storage, idb } = await setup({ database: true });
  const previous = storage.getItem(WORKSPACE_KEY); idb.openFailure = true;
  await assert.rejects(rewards.addVisit('customer_a'));
  assert.equal(storage.getItem(WORKSPACE_KEY), previous);
  await state.loadData(); assert.equal(state.storageStatus().readOnly, true); assert.equal(appState.customers.length, 1);
});
test('local canonical mirror is migrated when IndexedDB becomes available', async () => {
  await setup(); const idb = memoryIndexedDB(); globalThis.indexedDB = idb.api;
  await state.loadData();
  assert.equal(idb.records.get(WORKSPACE_RECORD).snapshot.customers.length, 1);
  assert.equal(appState.branding.businessName, 'Synthetic Merchant');
});
test('corrupt canonical mirror is archived before explicit recovery into newly available IDB', async () => {
  await setup({ seed: false, database: true, beforeLoad(storage) { storage.setItem(WORKSPACE_KEY, '{broken-mirror'); } });
  await state.restoreBackup(backup());
  assert.equal(localStorage.getItem(`${WORKSPACE_KEY}.recovery`), '{broken-mirror');
  assert.equal(appState.customers.length, 1);
});
test('blocked IDB open rejects without reading pending request.error', async () => {
  const idb = memoryIndexedDB(); idb.openBlocked = true; globalThis.indexedDB = idb.api;
  await assert.rejects(readWorkspace(), /Close other app windows/);
});
test('unsafe ID is escaped by CRM even if state is supplied outside importer', async () => {
  const { element } = await setup();
  appState.customers[0].id = 'a" onpointerenter="syntheticMarker=true';
  crm.renderCrmList();
  assert.doesNotMatch(element('crmList').innerHTML, /data-cid="a" onpointerenter/);
  assert.match(element('crmList').innerHTML, /&quot;/);
});
test('membership success survives failed local preference persistence without claiming delivery', async () => {
  const source = readFileSync(new URL('../public/community/js/membership.js', import.meta.url), 'utf8').replace(/^import .*\n/, '').replaceAll('export function ', 'function ');
  const element = installDom();
  const sandbox = { appState, storageKeys, document, window, localStorage: { setItem() { throw new Error('Full'); }, getItem() { return null; } }, FormData: class { getAll() { return ['product-updates']; } get(key) { return { businessName: 'Synthetic', contactName: 'Test', email: 'synthetic@example.invalid', updatesConsent: 'on', termsConsent: 'on' }[key] || ''; } }, fetch: async () => ({ ok: true, json: async () => ({}) }) };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  await sandbox.submitMembership({ preventDefault() {}, currentTarget: { setAttribute() {}, removeAttribute() {} } });
  assert.equal(element('membershipSuccess').hidden, false);
  assert.match(element('membershipSuccessMessage').textContent, /preferences have been recorded/);
  assert.match(element('membershipSuccessMessage').textContent, /could not remember/);
  assert.doesNotMatch(element('membershipSuccessMessage').textContent, /will be sent/);
});
test('async UI completion preserves a newer customer selection and note; repeated clicks are ignored while pending', async () => {
  const element = installDom();
  const elements = ['btnCheckIn', 'btnAddNote', 'btnSaveCustomer', 'btnAddProfileNote'];
  // Every element supports event capture; bindEvents registers handlers without browser services.
  const get = document.getElementById;
  document.getElementById = id => {
    const item = get(id);
    item.handlers ||= {};
    item.addEventListener = (event, handler) => { item.handlers[event] = handler; };
    return item;
  };
  document.addEventListener = () => {};
  const current = { currentCustomerId: 'a', selectedCrmCustomerId: 'a' };
  const first = customer('a'); const second = customer('b');
  let resolveVisit, resolveNote, visits = 0, notes = 0, clears = 0;
  const source = readFileSync(new URL('../public/community/js/app.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('function bindSavedAction'), source.indexOf('function registerServiceWorker'));
  const noop = () => {};
  const sandbox = { appState: current, document, window: { addEventListener: noop }, navigator: {},
    getCustomerById: id => id === 'a' ? first : id === 'b' ? second : null,
    setCurrentCustomer: customer => { current.currentCustomerId = customer?.id ?? null; setNoteDraftCustomer('counterNote', customer); },
    captureNoteDraft, clearSavedNoteDraft,
    addVisit: () => { visits += 1; return new Promise(resolve => { resolveVisit = resolve; }); },
    addNote: () => { notes += 1; return new Promise(resolve => { resolveNote = resolve; }); },
    renderMemberDashboard: noop, renderAll: noop, clearCounterInputs: () => { clears += 1; }, toast: noop,
    showScreen: noop, stopCameraScanner: noop, resetCrmForm: noop, renderCrmList: noop,
    refreshBrandDraftPreview: noop, exportData: noop, exportCustomersCsv: noop, importData: noop
  };
  vm.createContext(sandbox); vm.runInContext(code, sandbox); sandbox.bindEvents();
  for (const id of elements) assert.equal(typeof element(id).handlers.click, 'function');
  const pendingVisit = element('btnCheckIn').handlers.click();
  await element('btnCheckIn').handlers.click(); assert.equal(visits, 1);
  current.currentCustomerId = 'b'; element('scanInput').value = 'new search';
  resolveVisit({ customer: first, surpriseAward: null }); await pendingVisit;
  assert.equal(current.currentCustomerId, 'b'); assert.equal(clears, 0);
  current.currentCustomerId = 'a';
  setNoteDraftCustomer('counterNote', first); element('counterNote').value = 'original note';
  const pendingNote = element('btnAddNote').handlers.click();
  current.currentCustomerId = 'b'; element('counterNote').value = 'new draft note';
  resolveNote(first); await pendingNote;
  assert.equal(notes, 1); assert.equal(element('counterNote').value, 'new draft note');
  assert.equal(current.currentCustomerId, 'b');
});

test('the actual exported JSON stays within the accepted import byte limit', async () => {
  const candidate = backup();
  candidate.activity = Array.from({ length: 50000 }, (_, index) => ({ id: `activity_${index}`, customerId: 'customer_a', type: 'note', details: 'x'.repeat(270), at: '2026-09-01T00:00:00.000Z' }));
  const snapshot = { schemaVersion: 7, exportedAt: '2026-10-17T00:00:00.000Z', ...normaliseBackup(candidate) };
  assert.ok(new TextEncoder().encode(JSON.stringify(snapshot, null, 2)).length > MAX_BACKUP_BYTES, 'fixture exercises pretty-print overflow');
  const source = readFileSync(new URL('../public/community/js/app.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('export async function exportData'), source.indexOf('async function exportCustomersCsv')).replace('export async function', 'async function');
  let downloaded;
  const sandbox = { waitForPendingChanges: async () => ({ warning: '' }), serialisableState: () => snapshot, backupFilename: () => 'synthetic.json', downloadTextFile: (_name, text) => { downloaded = text; }, markBackupCreated() {}, updateBackupStatus() {}, toast() {} };
  vm.createContext(sandbox); vm.runInContext(code, sandbox); await sandbox.exportData();
  assert.ok(new TextEncoder().encode(downloaded).length <= MAX_BACKUP_BYTES);
  assert.equal(JSON.parse(downloaded).activity.length, 50000);
});
test('backup and CSV await already-queued changes, and a failed write is explicitly excluded', async () => {
  const { storage } = await setup();
  const source = readFileSync(new URL('../public/community/js/app.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('export async function exportData'), source.indexOf('function importData')).replace('export async function', 'async function');
  const downloads = [], notices = [];
  const sandbox = { appState, csvCell, waitForPendingChanges: state.waitForPendingChanges, serialisableState: state.serialisableState, backupFilename: () => 'synthetic.json', downloadTextFile: (name, text) => downloads.push({ name, text }), markBackupCreated() {}, updateBackupStatus() {}, toast: (...args) => notices.push(args) };
  vm.createContext(sandbox); vm.runInContext(code, sandbox);
  const saving = rewards.addVisit('customer_a');
  await sandbox.exportData(); await saving;
  assert.equal(JSON.parse(downloads.at(-1).text).customers[0].visits, 2);
  const savingAgain = rewards.addVisit('customer_a');
  await sandbox.exportCustomersCsv(); await savingAgain;
  assert.match(downloads.at(-1).text, /"3","22"/);
  failWrites(storage);
  const failed = rewards.addVisit('customer_a');
  const rejection = assert.rejects(failed);
  await sandbox.exportData(); await rejection;
  assert.equal(JSON.parse(downloads.at(-1).text).customers[0].visits, 3);
  assert.match(notices.at(-1)[0], /recent change failed/);
  assert.equal(notices.at(-1)[2], true);
});
test('an oversized ordinary mutation fails without changing durable or visible records', async () => {
  await setup(); const original = localStorage.getItem(WORKSPACE_KEY);
  await assert.rejects(state.updateState(draft => {
    draft.activity = Array.from({ length: 30000 }, (_, index) => ({ id: `activity_${index}`, customerId: 'customer_a', type: 'note', details: 'x'.repeat(1000), at: '2026-09-01T00:00:00.000Z' }));
  }), /maximum 20 MB/);
  assert.equal(localStorage.getItem(WORKSPACE_KEY), original); assert.equal(appState.activity.length, 0);
});
test('editing an unchanged migrated underscore or short customer code remains supported', async () => {
  const { element } = await setup();
  await state.restoreBackup(backup([customer('legacy', { token: 'VIP_01' })]));
  appState.selectedCrmCustomerId = 'legacy'; crm.populateCrmForm(appState.customers[0]);
  element('crmName').value = 'Updated legacy name';
  assert.equal((await crm.saveCustomerFromForm()).customer.token, 'VIP_01');
  element('crmToken').value = 'A';
  assert.equal((await crm.saveCustomerFromForm()).customer.token, 'A');
});
test('a pending deletion does not erase a newer new-customer draft', async () => {
  const { element } = await setup();
  appState.selectedCrmCustomerId = 'customer_a'; crm.populateCrmForm(appState.customers[0]);
  const pending = crm.deleteSelectedCustomer();
  crm.resetCrmForm(); element('crmName').value = 'Newer draft';
  await pending;
  assert.equal(element('crmName').value, 'Newer draft'); assert.equal(appState.selectedCrmCustomerId, null);
});
