// Only these coarse lifecycle events leave the app. Never send local app state,
// customer data, a URL/query, supplied identity, or a client-generated identifier.
const allowedEvents = new Set(['app_opened', 'install_requested', 'install_observed']);

export function createAcquisitionReporter({
  fetcher = (...args) => globalThis.fetch(...args),
  isOnline = () => globalThis.navigator?.onLine !== false
} = {}) {
  const attempted = new Set();
  return async function report(event) {
    if (!allowedEvents.has(event) || attempted.has(event) || !isOnline()) return false;
    attempted.add(event);
    try {
      const response = await fetcher('/api/registration-events', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        referrerPolicy: 'no-referrer', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event })
      });
      return response.ok;
    } catch { return false; }
    // No storage, offline queue, background sync, or automatic retry.
  };
}

export const recordAcquisitionEvent = createAcquisitionReporter();

export function observeAppInstallation(target, report = recordAcquisitionEvent) {
  const installed = event => {
    // A prompt response or standalone display mode does not prove installation.
    if (event.isTrusted) void report('install_observed');
  };
  target.addEventListener('appinstalled', installed);
  return () => target.removeEventListener('appinstalled', installed);
}
