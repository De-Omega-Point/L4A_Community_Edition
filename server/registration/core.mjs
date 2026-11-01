// Registration is self-reported, not authentication or email verification.
// The public Product ID is never an access credential. Only a browser receipt
// whose SHA-256 digest matches a stored row grants registration access.
export class RegistrationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'RegistrationError';
    this.code = code;
    this.status = status;
  }
}

export const REGISTRATION_COOKIE_NAME = '__Host-l4a_registration';
export const REGISTRATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
// Draft versions: review the actual notices before any production rollout.
export const REGISTRATION_NOTICE_VERSION = '2026-10-28-registration-3';
export const REGISTRATION_BODY_LIMIT = 4096;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RECEIPT = /^[0-9a-f]{64}$/u;
const fields = new Set(['kind', 'contactName', 'businessName', 'email', 'termsAccepted', 'privacyAcknowledged', 'marketingConsent', 'noticeVersion']);
const emailPattern = /^[^\s@<>(),;:"\\[\]\u0000-\u001f\u007f]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/u;
const controls = /[\u0000-\u001f\u007f]/u;

function fail(code, message, status) { throw new RegistrationError(code, message, status); }
function fieldText(value, limit) {
  return typeof value === 'string' && value.trim().length <= limit && !controls.test(value) ? value.trim() : '';
}

export function validateRegistration(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_input', 'Complete the registration form.');
  if (Object.keys(input).some(key => !fields.has(key))) fail('invalid_input', 'Send registration details only.');
  const { kind } = input;
  const contactName = fieldText(input.contactName, 120);
  const businessName = input.businessName === undefined ? '' : fieldText(input.businessName, 120);
  const email = fieldText(input.email, 254).toLowerCase();
  if (!['business', 'individual'].includes(kind) || !contactName || !emailPattern.test(email) || email.includes('..')) {
    fail('invalid_input', 'Enter your contact name, registration type and email.');
  }
  if (input.businessName !== undefined && (typeof input.businessName !== 'string' || controls.test(input.businessName) || input.businessName.trim().length > 120)) {
    fail('invalid_input', 'Use a valid business name or omit it.');
  }
  if (kind === 'business' && !businessName) fail('invalid_input', 'Enter your business name.');
  if (kind === 'individual' && businessName) fail('invalid_input', 'A business name applies only to business registrations.');
  if (input.termsAccepted !== true || input.privacyAcknowledged !== true) fail('consent_required', 'Review the terms and privacy information.');
  if (input.marketingConsent !== undefined && typeof input.marketingConsent !== 'boolean') fail('invalid_input', 'Marketing preference must be a boolean.');
  return { kind, contactName, businessName: businessName || null, email, marketingConsent: input.marketingConsent === true };
}

export function receiptFromRequest(request) {
  // Reject ambiguous duplicate cookies rather than letting parser order decide.
  const values = (request.headers.get('Cookie') || '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith(`${REGISTRATION_COOKIE_NAME}=`))
    .map(part => part.slice(REGISTRATION_COOKIE_NAME.length + 1));
  return values.length === 1 && RECEIPT.test(values[0]) ? values[0] : null;
}

export function createReceipt() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashReceipt(receipt) {
  if (!RECEIPT.test(receipt)) fail('cookie_required', 'Allow cookies and refresh registration before submitting.', 409);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(receipt));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function receiptCookie(receipt) {
  if (!RECEIPT.test(receipt)) fail('cookie_required', 'Allow cookies and refresh registration before submitting.', 409);
  return `${REGISTRATION_COOKIE_NAME}=${receipt}; Path=/; Max-Age=${REGISTRATION_COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

export function requireDatabase(db) {
  if (!db || typeof db.prepare !== 'function') fail('service_unavailable', 'Registration is temporarily unavailable. Please try again later.', 503);
  return db;
}

export async function findByReceiptHash(db, receiptHash) {
  const row = await requireDatabase(db).prepare(
    'SELECT id, kind, created_at FROM registered_products WHERE receipt_hash = ? LIMIT 1'
  ).bind(receiptHash).first();
  if (!row) return null;
  if (!UUID_V4.test(row.id) || !['business', 'individual'].includes(row.kind) || typeof row.created_at !== 'string') {
    fail('service_unavailable', 'Registration is temporarily unavailable. Please try again later.', 503);
  }
  return { id: row.id, kind: row.kind, createdAt: row.created_at };
}

export function checkedChanges(result) {
  if (!result || result.success !== true || !Number.isInteger(result.meta?.changes) || result.meta.changes < 0 || result.meta.changes > 1) {
    fail('service_unavailable', 'Registration could not be saved. Please try again later.', 503);
  }
  return result.meta.changes;
}

/**
 * Unique receipt_hash is the IP-free duplicate guard. Existing receipts retain
 * their original registration and consent, even on concurrent/repeated POSTs.
 * Emails and Product IDs are never used to recover or overwrite another row.
 * New receipts cannot create another row for the same normalized email.
 * Email matching never restores access or exposes the existing registration.
 */
export async function registerReceipt({ db, receiptHash, input, randomUUID = () => crypto.randomUUID(), now = () => new Date() }) {
  const details = validateRegistration(input);
  if (!RECEIPT.test(receiptHash)) fail('cookie_required', 'Allow cookies and refresh registration before submitting.', 409);
  const existing = await findByReceiptHash(db, receiptHash);
  if (existing) return { registration: existing, created: false };
  // Reject stale/missing notice acknowledgement only for a NEW registration.
  // Existing browser receipts retain the originally stored consent/version.
  if (input.noticeVersion !== REGISTRATION_NOTICE_VERSION) fail('notice_changed', 'The registration notices have changed. Reload this page and review them before submitting. No changes were saved by this request.', 422);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = randomUUID();
    if (!UUID_V4.test(id)) fail('id_unavailable', 'A secure registration ID could not be generated.', 503);
    const at = now().toISOString();
    const result = await db.prepare(`INSERT OR IGNORE INTO registered_products (
      id, receipt_hash, kind, contact_name, business_name, email,
      registered_at, terms_accepted_at, terms_version, privacy_acknowledged_at, privacy_version,
      marketing_consent, marketing_consent_at, marketing_consent_version, created_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM registered_products WHERE lower(trim(email)) = ?) RETURNING id`)
      .bind(id, receiptHash, details.kind, details.contactName, details.businessName, details.email,
        at, at, REGISTRATION_NOTICE_VERSION, at, REGISTRATION_NOTICE_VERSION,
        details.marketingConsent ? 1 : 0, details.marketingConsent ? at : null,
        details.marketingConsent ? REGISTRATION_NOTICE_VERSION : null, at, details.email).run();
    // D1 meta.changes includes AFTER INSERT trigger writes. RETURNING identifies
    // this exact registration without loosening generic mutation validation.
    const inserted = Array.isArray(result?.results)
      ? (result.success === true && result.results.length === 1 && result.results[0]?.id === id ? 1
        : result.success === true && result.results.length === 0 ? 0
        : fail('service_unavailable', 'Registration could not be saved. Please try again later.', 503))
      : checkedChanges(result);
    if (inserted === 1) return { registration: { id, kind: details.kind, createdAt: at }, created: true };
    const winner = await findByReceiptHash(db, receiptHash);
    if (winner) return { registration: winner, created: false };
    // The conditional INSERT is one atomic statement, not a racy preflight check.
    // Boolean existence only: never disclose/return/link the other receipt's row.
    const emailInUse = await db.prepare('SELECT 1 AS present FROM registered_products WHERE lower(trim(email)) = ? LIMIT 1').bind(details.email).first();
    if (emailInUse) fail('registration_review_needed', 'We could not create a new registration with these details. If you registered before, use the original browser or installed app. Otherwise contact Hello@De-Omega-Point.Com for help. Your email or Product ID alone cannot restore access.', 409);
    // OR IGNORE can also hide CHECK/NOT NULL failures. Retry ONLY a proven UUID
    // collision, never an arbitrary ignored insert or a failed D1 operation.
    const collision = await db.prepare('SELECT id FROM registered_products WHERE id = ? LIMIT 1').bind(id).first();
    if (!collision) fail('service_unavailable', 'Registration could not be saved. Please try again later.', 503);
  }
  fail('id_unavailable', 'Registration could not be completed. Please try again later.', 503);
}
