import { uid, nowIso } from './utils.js';
import { commitWorkspace, readLocalRecord, readWorkspace, WORKSPACE_KEY } from './storage.js';
import { defaultBranding, normaliseBackup, normaliseSnapshot, normaliseToken } from './data-schema.js';

export const storageKeys = {
  data: 'loyalty4all.data.v5', legacyData: 'loyalty4all.data.v4', olderLegacyData: 'loyalty4all.data.v3',
  branding: 'loyalty4all.branding.v5', legacyBranding: 'loyalty4all.branding.v4', olderLegacyBranding: 'loyalty4all.branding.v3',
  legacyRegistration: 'loyalty4all.registration.v1', communityMembership: 'loyalty4all.community-membership.v1',
  backupMeta: 'loyalty4all.backup-meta.v1', demoBackup: 'loyalty4all.demo-backup.v1'
};
export const appState = {
  customers: [], activity: [], currentCustomerId: null, selectedCrmCustomerId: null,
  camera: { stream: null, scanning: false, detector: null, frameTimer: null, fallbackCanvas: null },
  branding: { ...defaultBranding }, demoMode: false, storageWarning: ''
};
let committed = null;
let revision = 0;
let queue = Promise.resolve();
let readOnlyReason = '';
let lastMutationError = '';
let recoveryRecord;
let recoveryMirrorRaw;
const clone = value => structuredClone(value);
function publish(snapshot) {
  appState.customers = clone(snapshot.customers);
  appState.activity = clone(snapshot.activity);
  appState.branding = clone(snapshot.branding);
  appState.demoMode = snapshot.demoMode;
  if (!getCustomerById(appState.currentCustomerId)) appState.currentCustomerId = null;
  if (!getCustomerById(appState.selectedCrmCustomerId)) appState.selectedCrmCustomerId = null;
}
function localProductId() {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `LFA-LOCAL-${Array.from(bytes, value => alphabet[value % alphabet.length]).join('')}`;
}
function localJson(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}
function identity(branding) {
  let legacy;
  try { legacy = localJson(storageKeys.legacyRegistration); } catch {}
  if (!branding.productId) branding.productId = String(legacy?.productId || localProductId()).slice(0, 100);
  if (legacy?.businessName && ['Loyalty-4-All', 'Loyalty for All', 'My Business', ''].includes(branding.businessName)) {
    branding.businessName = String(legacy.businessName).slice(0, 120);
  }
}
function validEnvelope(record) {
  if (!record || record.schemaVersion !== 7 || !Number.isSafeInteger(record.revision) || record.revision < 1) throw new Error('The local workspace could not be verified.');
  return normaliseSnapshot(record.snapshot);
}
async function legacyCandidates(keys, databaseKey, failures) {
  const candidates = [];
  for (const key of keys) {
    try { const value = localJson(key); if (value) candidates.push(value); }
    catch (error) { failures.push(error); }
  }
  try { const value = await readLocalRecord(databaseKey); if (value) candidates.push(value); }
  catch (error) { failures.push(error); }
  return candidates.sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
}
export async function loadData() {
  await queue;
  readOnlyReason = '';
  lastMutationError = '';
  appState.storageWarning = '';
  revision = 0;
  committed = null;
  let record;
  recoveryRecord = undefined;
  recoveryMirrorRaw = undefined;
  try { record = await readWorkspace(); recoveryRecord = record ?? null; }
  catch {
    readOnlyReason = 'Local storage could not be read safely. Export any visible records and reopen the app before making changes.';
    try { record = localJson(WORKSPACE_KEY); } catch {}
  }
  if (record) {
    try {
      committed = validEnvelope(record);
      revision = record.revision;
      publish(committed);
      appState.storageWarning = readOnlyReason;
      return;
    } catch {
      readOnlyReason = 'The saved workspace is damaged. Existing storage has been preserved. Export any recovered records before restoring a verified backup.';
    }
  }
  // A browser may gain IndexedDB after previously using the locked localStorage fallback.
  // Import its complete canonical mirror before considering any older separate records.
  if (!record && globalThis.indexedDB && !readOnlyReason) {
    try {
      const raw = localStorage.getItem(WORKSPACE_KEY);
      if (raw) recoveryMirrorRaw = raw;
      const mirror = raw ? JSON.parse(raw) : null;
      if (mirror) {
        committed = validEnvelope(mirror);
        publish(committed);
        const saved = await commitWorkspace(0, clone(committed));
        revision = saved.revision;
        return;
      }
    } catch (error) {
      if (committed) { appState.storageWarning = error.message; return; }
      readOnlyReason = 'The local recovery copy could not be verified. Storage has been preserved; restore a verified backup.';
    }
  }
  // Migrate data and branding together. Never let a bootstrap write erase settings.
  const failures = [];
  const brandingFailures = [];
  const brandingCandidates = await legacyCandidates([storageKeys.branding, storageKeys.legacyBranding, storageKeys.olderLegacyBranding], 'business-branding', brandingFailures);
  failures.push(...brandingFailures);
  let branding = { ...defaultBranding };
  let validBranding = false;
  for (const candidate of brandingCandidates) {
    try {
      branding = normaliseBackup({ customers: [], activity: [], branding: candidate.branding ?? candidate }).branding;
      validBranding = true; break;
    } catch (error) { failures.push(error); }
  }
  const dataCandidates = await legacyCandidates([storageKeys.data, storageKeys.legacyData, storageKeys.olderLegacyData], 'business-data', failures);
  let snapshot;
  for (const candidate of dataCandidates) {
    try {
      const demoBackup = candidate.demoMode ? localJson(storageKeys.demoBackup) : null;
      snapshot = normaliseSnapshot({ ...candidate, branding, demoBackup });
      break;
    } catch (error) { failures.push(error); }
  }
  if ((!snapshot && dataCandidates.length) || (!validBranding && (brandingCandidates.length || brandingFailures.length)) || (failures.length && !snapshot)) {
    readOnlyReason ||= 'Some local records could not be recovered. Existing storage has not been changed. Restore a verified backup or reopen the app after fixing storage access.';
  }
  snapshot ||= normaliseSnapshot({ customers: [], activity: [], branding });
  identity(snapshot.branding);
  committed = snapshot;
  publish(committed);
  if (readOnlyReason) { appState.storageWarning = readOnlyReason; return; }
  try {
    const saved = await commitWorkspace(0, clone(committed));
    revision = saved.revision;
    if (failures.length) appState.storageWarning = 'Recovered an older valid local copy. Download a backup and check your records; the unreadable originals were preserved.';
  } catch (error) {
    appState.storageWarning = error.message || 'Storage is unavailable. Changes cannot be saved until access is restored.';
  }
}
export async function loadBrandingState() { if (!committed) await loadData(); }
export function storageStatus() { return { revision, readOnly: Boolean(readOnlyReason), warning: appState.storageWarning }; }
// The callback is synchronous and edits a detached draft. There are no nested commits.
export function updateState(change) {
  const run = async () => {
    if (!committed) throw new Error('Records are still loading. Please try again.');
    if (readOnlyReason) throw new Error(readOnlyReason);
    const draft = clone(committed);
    const result = change(draft);
    if (result && typeof result.then === 'function') throw new Error('A storage transaction must not wait on another action.');
    if (JSON.stringify(draft) === JSON.stringify(committed)) return clone(result);
    const validated = normaliseSnapshot(draft);
    const record = await commitWorkspace(revision, validated);
    committed = clone(validated);
    revision = record.revision;
    appState.storageWarning = '';
    lastMutationError = '';
    publish(committed);
    return clone(result);
  };
  const pending = queue.then(run, run);
  queue = pending.catch(error => { lastMutationError = error.message || 'A recent change could not be saved.'; });
  return pending;
}
export function saveBrandingState(branding) {
  const candidate = clone(branding);
  return updateState(draft => { draft.branding = candidate; return true; });
}
export async function waitForPendingChanges() {
  let pending;
  do { pending = queue; await pending; } while (pending !== queue);
  return { warning: lastMutationError };
}
export function serialisableState() {
  const snapshot = committed?.demoMode ? committed.demoBackup : (committed || appState);
  return { schemaVersion: 7, edition: 'community', storageModel: 'local-first', exportedAt: nowIso(), ...clone({ customers: snapshot.customers, activity: snapshot.activity, branding: snapshot.branding }) };
}
export function prepareBackup(parsed) {
  const candidate = normaliseBackup(parsed, committed?.branding || appState.branding);
  candidate.branding.productId ||= committed?.branding.productId || appState.branding.productId || localProductId();
  return candidate;
}
export function restoreBackup(parsed) {
  const candidate = prepareBackup(parsed);
  if (readOnlyReason && recoveryRecord !== undefined) {
    const original = clone(recoveryRecord);
    const run = async () => {
      const snapshot = normaliseSnapshot({ ...candidate, demoMode: false, demoBackup: null });
      const saved = await commitWorkspace(revision, snapshot, { recoveryRecord: original, ...(recoveryMirrorRaw === undefined ? {} : { recoveryMirrorRaw }) });
      committed = clone(snapshot); revision = saved.revision; readOnlyReason = ''; appState.storageWarning = ''; lastMutationError = '';
      publish(committed);
      return true;
    };
    const pending = queue.then(run, run);
    queue = pending.catch(error => { lastMutationError = error.message || 'A recent change could not be saved.'; });
    return pending;
  }
  return updateState(draft => {
    draft.customers = candidate.customers; draft.activity = candidate.activity; draft.branding = candidate.branding;
    draft.demoMode = false; draft.demoBackup = null;
    return true;
  });
}
export function addActivity(draft, type, customerId, details = '') {
  draft.activity.unshift({ id: uid('act'), type, customerId, details, at: nowIso() });
}
export function getCustomerById(id) { return appState.customers.find(customer => customer.id === id) || null; }
export function findCustomerByToken(token) {
  const normalised = normaliseToken(token);
  if (!normalised) return null;
  return appState.customers.find(customer => normaliseToken(customer.token) === normalised) || null;
}
export function findCustomers(query, limit = 6) {
  const normalised = String(query || '').trim().toLowerCase();
  if (!normalised) return [];
  return appState.customers.filter(customer => `${customer.name} ${customer.token} ${customer.email || ''} ${customer.phone || ''}`.toLowerCase().includes(normalised))
    .sort((a, b) => String(a.name).localeCompare(String(b.name))).slice(0, limit);
}
export function customerTierForPoints(points, branding = appState.branding) {
  const threshold = Math.max(1, Number(branding.rewardThreshold || 10));
  return points >= threshold * 2 ? 'VIP' : points >= threshold ? 'Regular' : 'Standard';
}
export function standardRewardReady(customer, branding = appState.branding) { return Number(customer?.points || 0) >= Number(branding.rewardThreshold || 10); }
export function pendingSurpriseReward(customer) { return customer?.surpriseRewards?.find(reward => !reward.redeemedAt) || null; }
export function rewardReady(customer) { return Boolean(standardRewardReady(customer) || pendingSurpriseReward(customer)); }
// Historical key retained: this timestamp records a request, never proof of a saved file.
export function markBackupCreated() {
  const timestamp = nowIso();
  try { localStorage.setItem(storageKeys.backupMeta, timestamp); } catch { return ''; }
  return timestamp;
}
export function lastBackupAt() { try { return localStorage.getItem(storageKeys.backupMeta) || ''; } catch { return ''; } }
export function loadDemoData() {
  return updateState(draft => {
    if (!draft.demoMode) draft.demoBackup = clone({ customers: draft.customers, activity: draft.activity, branding: draft.branding });
    const now = nowIso();
    draft.customers = [
      { id: uid('demo'), token: 'CUST-DEMO01', name: 'Alex Morgan', points: 8, visits: 8, createdAt: now, lastInteractionAt: now, lastVisitAt: now, isDemo: true },
      { id: uid('demo'), token: 'CUST-DEMO02', name: 'Jordan Lee', points: 12, visits: 12, createdAt: now, lastInteractionAt: now, lastVisitAt: now, isDemo: true }
    ];
    draft.activity = [];
    draft.demoMode = true;
    return true;
  });
}
export function clearDemoData() {
  return updateState(draft => {
    if (!draft.demoMode) return false;
    if (!draft.demoBackup) throw new Error('The demo restore point is missing. No records were changed.');
    Object.assign(draft, clone(draft.demoBackup), { demoMode: false, demoBackup: null });
    return true;
  });
}
