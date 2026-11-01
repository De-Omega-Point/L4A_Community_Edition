const DATABASE_NAME = 'loyalty-4-all-community';
const DATABASE_VERSION = 1;
const STORE_NAME = 'local-records';
export const WORKSPACE_RECORD = 'business-workspace-v1';
export const WORKSPACE_KEY = 'loyalty4all.workspace.v1';
const conflict = () => Object.assign(new Error('Records changed in another window. Reload before trying again; this action was not saved.'), { code: 'STORAGE_CONFLICT' });
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return resolve(null);
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;
    const fail = () => { settled = true; reject(request.error || new Error('Local storage is unavailable. Close other app windows and try again.')); };
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      if (settled) return request.result.close();
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = fail;
    request.onblocked = () => { settled = true; reject(new Error('Local storage is blocked. Close other app windows and try again.')); };
  });
}
export async function readLocalRecord(key) {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    let result = null;
    request.onsuccess = () => { result = request.result?.value ?? null; };
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onabort = transaction.onerror = () => { database.close(); reject(transaction.error || (request.readyState === 'done' ? request.error : null) || new Error('Local records could not be read.')); };
  });
}
export async function readWorkspace() {
  if (globalThis.indexedDB) return readLocalRecord(WORKSPACE_RECORD);
  const raw = localStorage.getItem(WORKSPACE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { corruptLocalRaw: raw }; }
}
// Compare and put happen in the SAME IndexedDB transaction, not just a per-tab queue.
export async function commitWorkspace(expectedRevision, snapshot, options = {}) {
  snapshot = structuredClone(snapshot);
  const recovering = Object.hasOwn(options, 'recoveryRecord');
  if (Object.hasOwn(options, 'recoveryMirrorRaw')) {
    if (localStorage.getItem(WORKSPACE_KEY) !== options.recoveryMirrorRaw) throw conflict();
    localStorage.setItem(`${WORKSPACE_KEY}.recovery`, options.recoveryMirrorRaw);
  }
  const database = await openDatabase();
  const commit = current => {
    if (recovering ? JSON.stringify(current ?? null) !== JSON.stringify(options.recoveryRecord) : (current?.revision ?? 0) !== expectedRevision) throw conflict();
    const previousRevision = recovering && Number.isSafeInteger(current?.revision) ? current.revision : expectedRevision;
    return { schemaVersion: 7, revision: Math.max(0, previousRevision) + 1, savedAt: Date.now(), snapshot };
  };
  if (!database) {
    if (!globalThis.navigator?.locks?.request) throw new Error('Safe local storage is unavailable in this browser. Export a backup and use a browser with IndexedDB support. Nothing was saved.');
    return navigator.locks.request(WORKSPACE_KEY, async () => {
      const record = commit(await readWorkspace());
      if (recovering && options.recoveryRecord) localStorage.setItem(`${WORKSPACE_KEY}.recovery`, options.recoveryRecord.corruptLocalRaw ?? JSON.stringify(options.recoveryRecord));
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(record));
      return record;
    });
  }
  const record = await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(WORKSPACE_RECORD);
    let next;
    let error;
    request.onsuccess = () => {
      try {
        next = commit(request.result?.value);
        if (recovering && options.recoveryRecord) store.put({ key: `${WORKSPACE_RECORD}-recovery`, value: options.recoveryRecord });
        store.put({ key: WORKSPACE_RECORD, value: next });
      }
      catch (cause) { error = cause; transaction.abort(); }
    };
    transaction.oncomplete = () => { database.close(); resolve(next); };
    transaction.onabort = transaction.onerror = () => { database.close(); reject(error || transaction.error || (request.readyState === 'done' ? request.error : null) || new Error('Your device could not save this change. Free up storage and try again. Nothing was saved.')); };
  });
  // The database is authoritative. Mirror failure must not turn a committed visit into a retry.
  try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(record)); } catch {}
  return record;
}
