/**
 * Browser registration uses only the server's HttpOnly receipt cookie.
 * Nothing here reads a cookie, persists identity, or generates a Product ID.
 * @typedef {{phase: 'checking'|'ready'|'saving'|'saved'|'error'|'uncertain'|'paused', productId: string|null, message: string, existing: boolean}} RegistrationState
 * @typedef {{kind: string, contactName: string, businessName?: string, email: string, noticeVersion: string, termsAccepted: boolean, privacyAcknowledged: boolean, marketingConsent: boolean}} RegistrationInput
 */

/** @type {RegistrationState} */
export const initialRegistrationState = {
  phase: 'checking', productId: null, message: 'Checking registration on this browser…', existing: false
};

/** @param {FormData} data @returns {RegistrationInput} */
export function registrationPayload(data) {
  const kind = String(data.get('kind') || '');
  return {
    kind,
    noticeVersion: String(data.get('noticeVersion') || ''),
    contactName: String(data.get('contactName') || '').trim(),
    ...(kind === 'business' ? { businessName: String(data.get('businessName') || '').trim() } : {}),
    email: String(data.get('email') || '').trim(),
    termsAccepted: data.get('termsAccepted') === 'on',
    privacyAcknowledged: data.get('privacyAcknowledged') === 'on',
    marketingConsent: data.get('marketingConsent') === 'on'
  };
}

class RegistrationRequestError extends Error {
  constructor(status, message, code = null) { super(message); this.status = status; this.code = code; }
}

const validProductId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function registrationWelcomePath(pathname) {
  return pathname.startsWith('/community/') ? '/community/welcome' : '/';
}

/** @param {{fetcher?: typeof fetch, onChange?: (state: RegistrationState) => void, timeoutMs?: number}} options */
export function createRegistrationFlow({ fetcher = (...args) => fetch(...args), onChange = () => {}, timeoutMs = 15000 } = {}) {
  let state = { ...initialRegistrationState };
  let disposed = false;
  let active = null;

  function update(next) {
    if (disposed) return;
    state = { productId: null, existing: false, ...next };
    onChange(state);
  }
  function begin(phase, message) {
    if (disposed || active) return null;
    const controller = new AbortController();
    const operation = { controller, timer: setTimeout(() => controller.abort(), timeoutMs) };
    active = operation;
    update({ phase, message });
    return operation;
  }
  function current(operation) { return !disposed && active === operation; }
  function finish(operation) {
    clearTimeout(operation.timer);
    if (active === operation) active = null;
  }
  async function request(operation, method = 'GET', input = undefined) {
    const response = await fetcher('/api/registrations', {
      method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      signal: operation.controller.signal,
      headers: { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify(input) } : {})
    });
    if (!current(operation) || operation.controller.signal.aborted) throw new Error('Interrupted');
    const body = await response.json();
    if (!response.ok) throw new RegistrationRequestError(response.status,
      typeof body?.message === 'string' ? body.message : 'Registration is temporarily unavailable.', body?.code);
    return body;
  }
  async function status(operation) {
    // The first response can set a cookie. A second request must prove it returns.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const value = await request(operation);
      if (typeof value?.cookieReady !== 'boolean' || typeof value.registered !== 'boolean' ||
          (value.registered && !validProductId(value.productId))) throw new Error('Invalid status response');
      if (value.cookieReady) return value;
    }
    throw new RegistrationRequestError(0, 'This browser could not keep the required secure cookie. Allow site cookies, then check again.');
  }
  function saved(value, existing) {
    update({ phase: 'saved', productId: value.productId, existing,
      message: existing ? 'You are already registered on this browser.' : 'Your registration has been saved.' });
  }

  async function check() {
    const recovering = state.phase === 'uncertain' || state.phase === 'paused';
    const operation = begin('checking', 'Checking registration on this browser…');
    if (!operation) return;
    try {
      const value = await status(operation);
      if (!current(operation)) return;
      if (value.registered) saved(value, true);
      else update({ phase: 'ready', message: recovering
        ? 'No saved registration was found on this browser. Review your details, then try saving again.'
        : 'Ready to register. Your Product ID will be created when your details are saved.' });
    } catch (error) {
      if (current(operation)) update({ phase: 'error', message: error instanceof RegistrationRequestError && error.status === 0
        ? error.message : 'We could not check registration. Check your connection and try again. Your details have not been submitted by this check.' });
    } finally { finish(operation); }
  }

  /** @param {RegistrationInput} input */
  async function submit(input) {
    if (state.phase !== 'ready') return;
    const operation = begin('saving', 'Saving your registration… Please keep this page open.');
    if (!operation) return;
    try {
      const value = await request(operation, 'POST', input);
      if (!current(operation)) return;
      if (value?.registered !== true || !validProductId(value.productId)) throw new Error('Invalid saved response');
      saved(value, value.created === false);
    } catch (error) {
      if (!current(operation)) return;
      if (error instanceof RegistrationRequestError && ([400, 422].includes(error.status) || (error.status === 409 && error.code === 'registration_review_needed'))) {
        update({ phase: 'ready', message: error.message });
      } else {
        update({ phase: 'uncertain', message: 'We could not confirm whether your registration was saved. Check its saved status before trying again; this will not submit another registration.' });
      }
    } finally { finish(operation); }
  }

  function interrupt() {
    if (disposed) return;
    if (active) {
      active.controller.abort();
      clearTimeout(active.timer);
      active = null;
    }
    update({ phase: 'paused', message: 'Registration paused. Check its saved status to continue.' });
  }
  function dispose() {
    disposed = true;
    if (active) { active.controller.abort(); clearTimeout(active.timer); active = null; }
  }
  return { check, submit, interrupt, dispose, getState: () => state };
}

/** Re-check on a browser Back/Forward-cache return; discard late work on exit. */
export function bindRegistrationLifecycle(flow, target) {
  const hide = () => flow.interrupt();
  const show = event => { if (event.persisted || flow.getState().phase === 'paused') void flow.check(); };
  target.addEventListener('pagehide', hide);
  target.addEventListener('pageshow', show);
  return () => {
    target.removeEventListener('pagehide', hide);
    target.removeEventListener('pageshow', show);
    flow.dispose();
  };
}
