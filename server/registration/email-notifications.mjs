// Server-only. No public send/retry endpoint. No registration/customer/secret logging.
// Queue creation is atomic via the proposed D1 AFTER INSERT trigger, never a second POST.
export const OWNER_NOTIFICATION_TO = 'Hello@De-Omega-Point.Com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TOKEN = /^[^\s\u0000-\u001f\u007f]{16,4096}$/u;
const MAILBOX = /^[^\s@<>(),;:"\\[\]\u0000-\u001f\u007f]+@[a-z0-9.-]+\.[a-z]{2,63}$/iu;
const MAX_ATTEMPTS = 5;
const LEASE_MS = 60000;

// This is an explicit provider-neutral gateway CONTRACT, not a ready-made vendor API.
// Endpoint, origin and token are reviewed server configuration, never form fields.
export function notificationConfiguration(env = {}) {
  if (env.REGISTRATION_EMAIL_PROVIDER === 'resend') return resendConfiguration(env);
  if (env.REGISTRATION_EMAIL_PROVIDER && env.REGISTRATION_EMAIL_PROVIDER !== 'gateway') return null;
  if (env.REGISTRATION_EMAIL_READY !== 'confirmed'
      || env.REGISTRATION_EMAIL_CONTRACT !== 'l4a-owner-notification-v1'
      || env.REGISTRATION_EMAIL_IDEMPOTENCY !== 'confirmed'
      || !TOKEN.test(env.REGISTRATION_EMAIL_TOKEN || '')
      || !MAILBOX.test(env.REGISTRATION_EMAIL_FROM || '')) return null;
  try {
    const endpoint = new URL(env.REGISTRATION_EMAIL_ENDPOINT);
    const approved = new URL(env.REGISTRATION_EMAIL_ORIGIN);
    // Pin exact HTTPS origin; do not follow redirects to another credential recipient.
    if (endpoint.protocol !== 'https:' || endpoint.origin !== approved.href.slice(0, -1)
        || env.REGISTRATION_EMAIL_ORIGIN !== endpoint.origin || endpoint.username || endpoint.password
        || endpoint.hash || endpoint.search || endpoint.port
        || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/iu.test(endpoint.hostname)
        || /\.(?:localhost|local|internal|invalid|test)$/iu.test(endpoint.hostname)
        || endpoint.hostname === 'localhost') return null;
    return Object.freeze({ endpoint: endpoint.href, token: env.REGISTRATION_EMAIL_TOKEN,
      from: env.REGISTRATION_EMAIL_FROM });
  } catch { return null; }
}


// Concrete Resend integration. Account/domain ownership is verified operationally;
// these explicit readiness flags must not be populated merely to make a test pass.
export function resendConfiguration(env = {}) {
  if (env.REGISTRATION_EMAIL_READY !== 'confirmed'
      || env.REGISTRATION_EMAIL_PROVIDER !== 'resend'
      || !TOKEN.test(env.RESEND_API_KEY || '')) return null;
  if (env.REGISTRATION_EMAIL_MODE === 'sandbox') {
    if ((typeof env.RESEND_ACCOUNT_EMAIL !== 'string' || env.RESEND_ACCOUNT_EMAIL.toLowerCase() !== OWNER_NOTIFICATION_TO.toLowerCase())
        || env.REGISTRATION_EMAIL_FROM !== 'onboarding@resend.dev') return null;
  } else if (env.REGISTRATION_EMAIL_MODE === 'production') {
    if (env.RESEND_SENDER_VERIFIED !== 'confirmed'
        || !MAILBOX.test(env.REGISTRATION_EMAIL_FROM || '')
        || /@(?:[^@]+\.)?resend\.dev$/iu.test(env.REGISTRATION_EMAIL_FROM)) return null;
  } else return null;
  return Object.freeze({ provider: 'resend', mode: env.REGISTRATION_EMAIL_MODE,
    from: env.REGISTRATION_EMAIL_FROM, token: env.RESEND_API_KEY });
}

export function createResendNotificationSender(config, fetchImpl = fetch) {
  return async ({ key, details }) => {
    // Sandbox is only for explicitly labelled fictitious tests, never live registrants.
    if (config.mode === 'sandbox' && (!/^SYNTHETIC TEST(?: |$)/u.test(details.name || '')
        || !/^[^@]+@example\.com$/u.test(details.email || ''))) return { state: 'failed' };
    try {
      const text = [
        'A Loyalty4All registration was saved.',
        `Name: ${details.name}`, `Business: ${details.businessName ?? '(individual)'}`,
        `Email: ${details.email}`, `Product ID: ${details.productId}`,
        `Registration time: ${details.registeredAt}`,
        `Marketing consent: ${details.marketingConsent ? 'Yes' : 'No'}`,
      ].join('\n');
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ from: config.from, to: [OWNER_NOTIFICATION_TO],
          subject: 'Loyalty4All registration notification', text }),
      });
      const body = await readSmallJson(response);
      if (response.ok && typeof body?.id === 'string' && UUID.test(body.id)) return { state: 'accepted', providerId: body.id };
      // 409 can mean an in-flight/idempotency conflict; a 408 is also ambiguous.
      // Known rejection is terminal here, including rate limits: no automatic resend
      // can cross Resend's 24-hour deduplication lifetime. Operator review is explicit.
      if ([400, 401, 403, 404, 405, 413, 422, 429].includes(response.status)
          && typeof body?.name === 'string' && typeof body?.message === 'string') return { state: 'failed' };
      return { state: 'uncertain' };
    } catch { return { state: 'uncertain' }; }
  };
}

function decodePayload(text, id) {
  const row = JSON.parse(text);
  if (!row || Object.keys(row).sort().join(',') !== 'businessName,email,marketingConsent,name,productId,registeredAt'
      || row.productId !== id || !UUID.test(id)
      || typeof row.name !== 'string' || !row.name || row.name.length > 120
      || (row.businessName !== null && (typeof row.businessName !== 'string' || row.businessName.length > 120))
      || typeof row.email !== 'string' || row.email.length > 254 || !MAILBOX.test(row.email)
      || ![0, 1].includes(row.marketingConsent)
      || typeof row.registeredAt !== 'string' || !Number.isFinite(Date.parse(row.registeredAt))) throw new Error('Invalid notification');
  return { ...row, marketingConsent: row.marketingConsent === 1 };
}

export function createHttpsNotificationSender(config, fetchImpl = fetch) {
  return async ({ key, details }) => {
    let response;
    try {
      response = await fetchImpl(config.endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ contract: 'l4a-owner-notification-v1', from: config.from,
          to: OWNER_NOTIFICATION_TO, subject: 'Loyalty4All registration notification', registration: details }),
      });
      // Never read/log arbitrary vendor responses or expose them to the registrant.
      const body = await readSmallJson(response);
      if (response.ok && body?.accepted === true && typeof body.messageId === 'string'
          && /^[A-Za-z0-9._:-]{1,200}$/u.test(body.messageId)) return { state: 'accepted', providerId: body.messageId };
      // Retry only an explicit NOT ACCEPTED answer under the reviewed gateway contract.
      if (body?.accepted === false && body.retryable === true && [429, 503].includes(response.status)) return { state: 'retry' };
      if (body?.accepted === false && body.retryable === false) return { state: 'failed' };
      return { state: 'uncertain' };
    } catch { return { state: 'uncertain' }; }
  };
}
async function readSmallJson(response) {
  if (!response.body) return null;
  const reader = response.body.getReader(); let bytes = 0; const parts = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) { await reader.cancel(); return null; }
      parts.push(value);
    }
    const data = new Uint8Array(bytes); let offset = 0;
    for (const part of parts) { data.set(part, offset); offset += part.byteLength; }
    return JSON.parse(new TextDecoder().decode(data));
  } catch { return null; } finally { reader.releaseLock(); }
}

// Exact Product ID only; no enumeration or global drain. Safe to invoke from an
// authorised retry workflow later. An expired in-flight lease is NOT resent.
export async function dispatchRegistrationNotification({ db, productId, send, now = () => Date.now(), randomUUID = () => crypto.randomUUID() }) {
  if (!UUID.test(productId) || !db || typeof send !== 'function') return { state: 'disabled' };
  const at = now(); const lease = randomUUID();
  if (!Number.isSafeInteger(at) || !UUID.test(lease)) return { state: 'disabled' };
  await db.prepare(`UPDATE registration_email_outbox SET state = 'uncertain', failure_code = 'lease_expired', lease_id = NULL, lease_until = NULL
    WHERE product_id = ? AND state = 'sending' AND lease_until <= ?`).bind(productId, at).run();
  const claimed = await db.prepare(`UPDATE registration_email_outbox SET state = 'sending', attempts = attempts + 1, lease_id = ?, lease_until = ?
    WHERE product_id = ? AND state = 'pending' AND attempts < ? AND available_at <= ?`).bind(lease, at + LEASE_MS, productId, MAX_ATTEMPTS, at).run();
  if (claimed?.success !== true || claimed.meta?.changes !== 1) return { state: 'not_claimed' };
  const event = await db.prepare(`SELECT payload, attempts FROM registration_email_outbox WHERE product_id = ? AND state = 'sending' AND lease_id = ?`).bind(productId, lease).first();
  let outcome;
  try {
    const details = decodePayload(event?.payload, productId);
    outcome = await send({ key: `l4a-registration:${productId}`, details });
  } catch { outcome = { state: 'uncertain' }; }
  const state = outcome?.state === 'accepted' && /^[A-Za-z0-9._:-]{1,200}$/u.test(outcome.providerId || '') ? 'accepted'
    : outcome?.state === 'retry' ? (event.attempts < MAX_ATTEMPTS ? 'pending' : 'failed')
    : outcome?.state === 'failed' ? 'failed' : 'uncertain';
  const updated = await db.prepare(`UPDATE registration_email_outbox SET state = ?, available_at = ?, lease_id = NULL, lease_until = NULL,
    accepted_at = ?, provider_id = ?, failure_code = ?, payload = CASE WHEN ? = 'accepted' THEN NULL ELSE payload END
    WHERE product_id = ? AND state = 'sending' AND lease_id = ?`).bind(state,
      at + Math.min(60000 * 2 ** (event?.attempts || 1), 900000), state === 'accepted' ? now() : null,
      state === 'accepted' ? outcome.providerId : null, state === 'accepted' ? null : (state === 'pending' ? 'retry_later' : state),
      state, productId, lease).run();
  return { state: updated?.success === true && updated.meta?.changes === 1 ? state : 'uncertain' };
}

export function registrationNotificationHook(env, ctx) {
  const config = notificationConfiguration(env);
  if (!config || !env.DB || !ctx || typeof ctx.waitUntil !== 'function') return undefined;
  const send = config.provider === 'resend' ? createResendNotificationSender(config) : createHttpsNotificationSender(config);
  return ({ registration }) => {
    // Deferred email work never changes a successfully saved registration response.
    ctx.waitUntil(dispatchRegistrationNotification({ db: env.DB, productId: registration.id, send }).catch(() => undefined));
  };
}
