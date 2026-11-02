// D1-backed registration receipt adapter. No authentication provider, email
// service, signing key, localStorage identity, IP address or user-agent tracking.
import {
  RegistrationError, REGISTRATION_BODY_LIMIT, checkedChanges, createReceipt,
  findByReceiptHash, hashReceipt, receiptCookie, receiptFromRequest, registerReceipt,
} from './core.mjs';

const responseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' };
const eventColumns = Object.freeze({ app_opened: 'app_opened_at', install_requested: 'install_requested_at', install_observed: 'install_observed_at' });
const unavailable = () => new RegistrationError('service_unavailable', 'Registration is temporarily unavailable. Please try again later.', 503);
function json(body, status = 200, headers = {}) { return Response.json(body, { status, headers: { ...responseHeaders, ...headers } }); }
function reject(code, message, status) { throw new RegistrationError(code, message, status); }

/** Minimal server-only access check. Null means no registered receipt.
 * Missing D1/schema throws: callers MUST fail closed, never serve the app.
 */
export async function registrationAccess(request, db) {
  const receipt = receiptFromRequest(request);
  try {
    // The empty hash cannot match a valid row, but still checks table availability.
    return await findByReceiptHash(db, receipt ? await hashReceipt(receipt) : '');
  } catch { throw unavailable(); }
}

function requireSameOriginJson(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) {
    reject('same_origin_required', 'Submit registration from this website.', 403);
  }
  if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    reject('unsupported_media_type', 'Send a JSON request.', 415);
  }
}

async function readBoundedJson(request) {
  const length = request.headers.get('Content-Length');
  if (length && /^\d+$/u.test(length) && Number(length) > REGISTRATION_BODY_LIMIT) {
    reject('payload_too_large', 'Registration details are too large.', 413);
  }
  if (!request.body) reject('invalid_input', 'Send a JSON request.', 400);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > REGISTRATION_BODY_LIMIT) {
        await reader.cancel();
        reject('payload_too_large', 'Registration details are too large.', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { reject('invalid_input', 'Send valid JSON registration details.', 400); }
}

async function status(request, db) {
  const receipt = receiptFromRequest(request);
  if (!receipt) {
    // Read-only collision/schema check. Cookie creation does not create a row.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = createReceipt();
      if (!await findByReceiptHash(db, await hashReceipt(candidate))) {
        return json({ cookieReady: false, registered: false }, 200, { 'Set-Cookie': receiptCookie(candidate) });
      }
    }
    throw unavailable();
  }
  const row = await registrationAccess(request, db);
  return json(row ? { cookieReady: true, registered: true, productId: row.id } : { cookieReady: true, registered: false });
}

async function recordEvent(db, receiptHash, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, 'event') || typeof input.event !== 'string' || !Object.hasOwn(eventColumns, input.event)) {
    reject('invalid_input', 'Choose a supported app event.', 400);
  }
  const row = await findByReceiptHash(db, receiptHash);
  if (!row) reject('registration_required', 'Register before opening or installing the app.', 403);
  // This allowlisted column is not caller-provided SQL. The first observation
  // wins; repeats make no additional write. These are NOT verified downloads.
  const column = eventColumns[input.event];
  const result = await db.prepare(`UPDATE registered_products SET ${column} = COALESCE(${column}, ?) WHERE receipt_hash = ? AND ${column} IS NULL`)
    .bind(new Date().toISOString(), receiptHash).run();
  if (checkedChanges(result) === 0 && !await findByReceiptHash(db, receiptHash)) {
    reject('registration_required', 'Register before opening or installing the app.', 403);
  }
  return json({ recorded: true, event: input.event });
}

/** Handles only /api/registrations and /api/registration-events. */
export async function handleRegistrationRequest(request, db, { afterRegistration } = {}) {
  try {
    const path = new URL(request.url).pathname;
    if (!['/api/registrations', '/api/registration-events'].includes(path)) return json({ code: 'not_found', message: 'Not found.' }, 404);
    if (path === '/api/registrations' && request.method === 'GET') return await status(request, db);
    if (request.method !== 'POST') return json({ code: 'method_not_allowed', message: 'Method not allowed.' }, 405, { Allow: path === '/api/registrations' ? 'GET, POST' : 'POST' });
    requireSameOriginJson(request);
    const receipt = receiptFromRequest(request);
    if (!receipt) reject('cookie_required', 'Allow cookies and refresh registration before submitting.', 409);
    const input = await readBoundedJson(request);
    const receiptHash = await hashReceipt(receipt);
    if (path === '/api/registration-events') return await recordEvent(db, receiptHash, input);
    const result = await registerReceipt({ db, receiptHash, input });
    // Trusted default-off notification hook, never visitor-controlled configuration.
    // Retries may dispatch only an existing pending event; accepted events stay closed.
    try { afterRegistration?.(result); } catch { /* Saved registration remains successful. */ }
    return json({ registered: true, productId: result.registration.id, created: result.created }, result.created ? 201 : 200);
  } catch (error) {
    // Never send database errors, input data or raw receipts to responses/logs.
    const safe = error instanceof RegistrationError ? error : unavailable();
    return json({ code: safe.code, message: safe.message }, safe.status);
  }
}
