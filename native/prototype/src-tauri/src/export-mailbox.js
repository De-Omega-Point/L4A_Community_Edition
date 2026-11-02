// This is a bounded export-only mailbox, not filesystem IPC. Rust chooses the path.
(() => {
  if (window.top !== window) return;
  const MAX = 20 * 1024 * 1024;
  let pending = null;
  const api = Object.freeze({
    save(filename, text, type) {
      if (pending) return Promise.resolve({ status: 'busy' });
      if (typeof filename !== 'string' || filename.length > 180 || typeof type !== 'string' || type.length > 64) return Promise.resolve({ status: 'failed' });
      if (typeof text !== 'string' || text.length > MAX || new TextEncoder().encode(text).length > MAX) {
        return Promise.resolve({ status: 'failed' });
      }
      return new Promise(resolve => {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const token = crypto.randomUUID();
        const timer = setTimeout(() => api.complete(url, token, 'unconfirmed'), 120000);
        pending = { url, token, filename, text, type, resolve, timer };
        try {
          const a = document.createElement('a');
          a.href = url; a.download = filename;
          a.click();
        } catch { api.complete(url, token, 'failed'); }
      });
    },
    take(url) {
      if (!pending || pending.url !== url || pending.taken) return null;
      pending.taken = true;
      const { token, filename, text, type } = pending;
      pending.text = ''; // do not retain a second payload while native confirmation is open
      return { token, filename, text, type };
    },
    complete(url, token, status) {
      if (!pending || pending.url !== url || pending.token !== token) return;
      const done = pending; pending = null;
      clearTimeout(done.timer); URL.revokeObjectURL(url);
      done.resolve({ status });
    }
  });
  Object.defineProperty(window, '__L4A_EXPORT_MAILBOX_V1__', { value: api, configurable: false, writable: false });
})();
