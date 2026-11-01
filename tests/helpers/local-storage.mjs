export function memoryStorage() {
  const records = new Map();
  return { records, getItem: key => records.get(key) ?? null, setItem(key, value) { records.set(key, String(value)); }, removeItem: key => records.delete(key) };
}
export function installLocks() {
  let tail = Promise.resolve();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request(_key, callback) { const result = tail.then(callback); tail = result.catch(() => {}); return result; } } } });
}
export function installDom() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, disabled: false, hidden: false, textContent: '', innerHTML: '', classList: { add() {}, remove() {}, toggle() {} }, style: {}, addEventListener() {}, removeAttribute() {}, querySelectorAll: () => [] });
    return elements.get(id);
  };
  globalThis.document = { getElementById: element, querySelector: element, querySelectorAll: () => [], documentElement: { style: { setProperty() {} } } };
  globalThis.window = { dispatchEvent() {} };
  return element;
}
// Small transaction-aware synthetic IndexedDB double. Writes become visible only on completion;
// abort discards the staged map, and read/write transactions serialize across callers.
export function memoryIndexedDB() {
  const records = new Map();
  const control = { records, failCommit: false, failRead: false, openFailure: false, openBlocked: false, completes: 0, aborts: 0 };
  let tail = Promise.resolve();
  const database = {
    objectStoreNames: { contains: () => true }, close() {},
    transaction(_store, mode) {
      let release;
      const done = new Promise(resolve => { release = resolve; });
      const start = tail;
      tail = done;
      let working, aborted = false, pending = 0, finishing = false;
      const tx = { error: null, abort() { if (aborted) return; aborted = true; control.aborts += 1; setImmediate(() => { tx.onabort?.(); release(); }); }, objectStore() { return {
        get(key) {
          const request = { error: null, result: undefined };
          pending += 1;
          start.then(() => setImmediate(() => {
            if (aborted) return;
            working ||= new Map(structuredClone([...records]));
            if (control.failRead) { request.error = tx.error = new Error('Synthetic read failure'); tx.abort(); return; }
            request.result = working.has(key) ? { key, value: structuredClone(working.get(key)) } : undefined;
            request.onsuccess?.();
            pending -= 1;
            finish();
          }));
          return request;
        },
        put({ key, value }) { working.set(key, structuredClone(value)); return {}; }
      }; } };
      function finish() {
        if (pending || finishing || aborted) return;
        finishing = true;
        setImmediate(() => {
          if (aborted) return;
          if (mode === 'readwrite' && control.failCommit) { tx.error = new Error('Synthetic commit failure'); tx.abort(); return; }
          if (mode === 'readwrite') { records.clear(); for (const [key,value] of working) records.set(key,value); }
          control.completes += 1;
          tx.oncomplete?.(); release();
        });
      }
      return tx;
    }
  };
  control.api = { open() {
    const request = { result: undefined, readyState: 'pending' };
    Object.defineProperty(request, 'error', { get() { if (request.readyState !== 'done') throw new DOMException('Pending', 'InvalidStateError'); return control.openFailure ? new Error('Synthetic open failure') : null; } });
    setImmediate(() => {
      if (control.openBlocked) { request.onblocked?.(); return; }
      request.readyState = 'done'; request.result = database;
      if (control.openFailure) request.onerror?.(); else request.onsuccess?.();
    });
    return request;
  } };
  return control;
}
