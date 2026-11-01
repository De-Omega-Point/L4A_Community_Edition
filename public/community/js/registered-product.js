// Display-only receipt check. Never accepts a typed ID or writes workspace/backup data.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function readRegisteredProduct({ fetcher = globalThis.fetch, online = globalThis.navigator?.onLine !== false, signal } = {}) {
  if (!online) return { state: 'offline' };
  try {
    const response = await fetcher('/api/registrations', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      referrerPolicy: 'no-referrer', signal
    });
    if (!response.ok) return { state: 'unavailable' };
    const result = await response.json();
    if (result.registered === true && result.cookieReady === true && typeof result.productId === 'string' && UUID.test(result.productId)) {
      return { state: 'verified', productId: result.productId };
    }
    return result.registered === false ? { state: 'unlinked' } : { state: 'unavailable' };
  } catch { return { state: 'unavailable' }; }
}
export function productPresentation(result) {
  const messages = {
    checking: ['Checking registration…', 'Checking the registration receipt for this browser.'],
    offline: ['Not verified while offline', 'Reconnect and check again. Your local loyalty records remain available; a backup does not restore the browser registration receipt.'],
    unlinked: ['No registration linked to this browser', 'An existing registration may belong to another browser, or its cookie may have been cleared. A restored backup does not restore that receipt.'],
    unavailable: ['Registration check unavailable', 'Try again when connected. This does not mean your registration or local records have been lost.']
  };
  return result.state === 'verified'
    ? [result.productId, 'Verified using this browser’s registration receipt. This identifies the registration, not ownership of imported customer records.']
    : messages[result.state] || messages.unavailable;
}
export function mountRegisteredProduct({ document: doc = document, target = window, read = readRegisteredProduct } = {}) {
  const id = doc.getElementById('registeredProductId');
  const status = doc.getElementById('registeredProductStatus');
  const button = doc.getElementById('btnCheckRegistration');
  let generation = 0;
  let controller;
  const render = result => {
    const [value, message] = productPresentation(result);
    id.textContent = value;
    status.textContent = message;
  };
  async function check() {
    const current = ++generation;
    controller?.abort();
    controller = new AbortController();
    const activeController = controller;
    render({ state: 'checking' });
    button.disabled = true;
    const timeout = setTimeout(() => activeController.abort(), 8000);
    try {
      const result = await read({ signal: activeController.signal });
      if (current === generation) render(result);
    } finally {
      clearTimeout(timeout);
      if (current === generation) button.disabled = false;
    }
  }
  button.addEventListener('click', check);
  target.addEventListener('online', check);
  target.addEventListener('pageshow', check);
  target.addEventListener('offline', () => {
    generation++;
    controller?.abort();
    button.disabled = false;
    render({ state: 'offline' });
  });
  void check();
}
