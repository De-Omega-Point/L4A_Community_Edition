import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { registerReceipt, REGISTRATION_NOTICE_VERSION, REGISTRATION_COOKIE_NAME } from '../server/registration/core.mjs';
import { handleRegistrationRequest } from '../server/registration/provider.mjs';
import { notificationConfiguration, registrationNotificationHook, createHttpsNotificationSender, dispatchRegistrationNotification, OWNER_NOTIFICATION_TO } from '../server/registration/email-notifications.mjs';
const ID = '11111111-1111-4111-8111-111111111111';
const LEASE = '22222222-2222-4222-8222-222222222222';
const input = { kind: 'business', contactName: 'Synthetic Test', businessName: 'Synthetic Shop', email: 'synthetic@example.com', termsAccepted: true, privacyAcknowledged: true, marketingConsent: false, noticeVersion: REGISTRATION_NOTICE_VERSION };
function database(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  sql.exec('PRAGMA foreign_keys = ON');
  sql.exec(readFileSync(new URL('../drizzle/0003_yellow_nightshade.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../docs/proposed-sql/registration-email-outbox.sql', import.meta.url), 'utf8'));
  return { sql, prepare(q) { return { bind(...args) { return {
    async first() { return sql.prepare(q).get(...args) || null; },
    async run() { const r = sql.prepare(q).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
  }; } }; } };
}
const saved = db => registerReceipt({ db, receiptHash: 'a'.repeat(64), input, randomUUID: () => ID });
const event = db => db.sql.prepare('SELECT * FROM registration_email_outbox WHERE product_id = ?').get(ID);
const env = { REGISTRATION_EMAIL_READY: 'confirmed', REGISTRATION_EMAIL_CONTRACT: 'l4a-owner-notification-v1', REGISTRATION_EMAIL_IDEMPOTENCY: 'confirmed', REGISTRATION_EMAIL_TOKEN: 'synthetic-token-no-real-key', REGISTRATION_EMAIL_FROM: 'noreply@example.com', REGISTRATION_EMAIL_ENDPOINT: 'https://mail.example.com/registration', REGISTRATION_EMAIL_ORIGIN: 'https://mail.example.com' };
const clock = () => Date.now() + 2000;
const dispatch = (db, send, opts = {}) => dispatchRegistrationNotification({ db, productId: ID, send, now: clock, randomUUID: () => LEASE, ...opts });

test('default-off config and exact trusted HTTPS origin, no credentials or localhost URLs', () => {
  assert.equal(notificationConfiguration({}), null);
  assert.equal(registrationNotificationHook({}, {}), undefined);
  assert.ok(notificationConfiguration(env));
  for (const update of [{ REGISTRATION_EMAIL_READY: '' }, { REGISTRATION_EMAIL_CONTRACT: '' }, { REGISTRATION_EMAIL_IDEMPOTENCY: '' }, { REGISTRATION_EMAIL_TOKEN: '' }, { REGISTRATION_EMAIL_FROM: 'x\nBcc:y@example.com' }, ...['http://mail.example.com/registration', 'https://other.example.com/registration', 'https://user:pass@mail.example.com/registration', 'https://mail.example.com/registration?token=x', 'https://127.0.0.1/', 'https://localhost/'].map(REGISTRATION_EMAIL_ENDPOINT => ({ REGISTRATION_EMAIL_ENDPOINT }))]) assert.equal(notificationConfiguration({ ...env, ...update }), null);
});
test('new registration atomically creates exactly one minimal snapshot; duplicate keeps original event', async t => {
  const db = database(t); const first = await saved(db); assert.equal(first.created, true);
  const original = event(db); const snapshot = JSON.parse(original.payload);
  assert.deepEqual(Object.keys(snapshot).sort(), ['name', 'businessName', 'email', 'productId', 'registeredAt', 'marketingConsent'].sort());
  assert.equal(snapshot.marketingConsent, 0); assert.equal(snapshot.productId, ID);
  assert.equal((await saved(db)).created, false); assert.deepEqual(event(db), original);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM registration_email_outbox').get().n, 1);
});
test('outbox insertion failure rolls back registration insert atomically', async t => {
  const db = database(t);
  db.sql.exec("CREATE TRIGGER block_queue BEFORE INSERT ON registration_email_outbox BEGIN SELECT RAISE(ABORT, 'synthetic error'); END");
  await assert.rejects(saved(db));
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM registered_products').get().n, 0);
});
test('schema installation never backfills old registrations', t => {
  const db = database(t); assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM registration_email_outbox').get().n, 0);
  assert.doesNotMatch(readFileSync(new URL('../docs/proposed-sql/registration-email-outbox.sql', import.meta.url), 'utf8'), /INSERT[^;]+SELECT/iu);
});
test('successful dispatch fixed recipient, approved fields only, no receipt; clears duplicate PII payload', async t => {
  const db = database(t); await saved(db); let sent;
  const send = createHttpsNotificationSender(notificationConfiguration(env), async (url, options) => {
    sent = { url, ...options }; return Response.json({ accepted: true, messageId: 'synthetic-001' });
  });
  assert.deepEqual(await dispatch(db, send), { state: 'accepted' });
  const body = JSON.parse(sent.body);
  assert.equal(body.to, OWNER_NOTIFICATION_TO); assert.equal(body.registration.marketingConsent, false);
  assert.equal(sent.redirect, 'error'); assert.equal(sent.headers['Idempotency-Key'], `l4a-registration:${ID}`);
  assert.doesNotMatch(sent.body, /receipt|password|customer|token/iu);
  assert.equal(event(db).payload, null); assert.equal(event(db).provider_id, 'synthetic-001');
  assert.deepEqual(await dispatch(db, () => { throw Error('must not resend'); }), { state: 'not_claimed' });
});
test('concurrent attempts lease once; loser never sends', async t => {
  const db = database(t); await saved(db); let calls = 0;
  const results = await Promise.all([dispatch(db, async () => { calls++; return { state: 'accepted', providerId: 'one' }; }), dispatch(db, async () => { calls++; return { state: 'accepted', providerId: 'two' }; })]);
  assert.equal(calls, 1); assert.equal(results.filter(r => r.state === 'accepted').length, 1);
});
test('confirmed rejection retries at bounded backoff and exhausts at five attempts', async t => {
  const db = database(t); await saved(db); let at = clock();
  for (let i = 1; i <= 5; i++) {
    const result = await dispatch(db, async () => ({ state: 'retry' }), { now: () => at });
    assert.equal(result.state, i === 5 ? 'failed' : 'pending'); assert.equal(event(db).attempts, i);
    assert.equal((await dispatch(db, () => assert.fail('too soon'), { now: () => at })).state, 'not_claimed');
    at += 1000000;
  }
  assert.equal((await dispatch(db, () => assert.fail('exhausted'), { now: () => at })).state, 'not_claimed');
});
test('network ambiguity never auto-retries or undoes saved registration', async t => {
  const db = database(t); await saved(db);
  const send = createHttpsNotificationSender(notificationConfiguration(env), async () => { throw new Error('secret vendor error'); });
  assert.equal((await dispatch(db, send)).state, 'uncertain');
  assert.equal((await dispatch(db, () => assert.fail('ambiguous resend'))).state, 'not_claimed');
  assert.ok(db.sql.prepare('SELECT id FROM registered_products WHERE id = ?').get(ID));
});
test('stale sending lease requires reconciliation rather than automatic resend', async t => {
  const db = database(t); await saved(db); db.sql.prepare("UPDATE registration_email_outbox SET state='sending',lease_id=?,lease_until=0 WHERE product_id=?").run(LEASE, ID);
  assert.equal((await dispatch(db, () => assert.fail('stale resend'))).state, 'not_claimed'); assert.equal(event(db).state, 'uncertain');
});
test('non-acceptance, redirects, arbitrary errors and oversized responses are not success', async () => {
  for (const response of [Response.json({ ok: true }), Response.json({ accepted: true }), Response.json({ accepted: false, retryable: true }, { status: 500 }), new Response('x'.repeat(3000)), Response.json({ accepted: true, messageId: 'x' }, { status: 302 })]) {
    const sender = createHttpsNotificationSender(notificationConfiguration(env), async () => response);
    assert.equal((await sender({ key: 'synthetic', details: {} })).state, 'uncertain');
  }
  assert.equal((await createHttpsNotificationSender(notificationConfiguration(env), async () => Response.json({ accepted: false, retryable: true }, { status: 429 }))({ key: 'x', details: {} })).state, 'retry');
});
test('deleting approved registration would cascade pending notification data', async t => {
  const db = database(t); await saved(db); db.sql.prepare('DELETE FROM registered_products WHERE id=?').run(ID); assert.equal(event(db), undefined);
});
test('failed trusted post-save hook does not turn saved registration into error', async t => {
  const db = database(t);
  const request = new Request('https://example.com/api/registrations', { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json', Cookie: `${REGISTRATION_COOKIE_NAME}=${'ab'.repeat(32)}` }, body: JSON.stringify(input) });
  const response = await handleRegistrationRequest(request, db, { afterRegistration() { throw new Error('synthetic provider error'); } });
  assert.equal(response.status, 201); assert.equal((await response.json()).registered, true);
});

test('correction or withdrawal clears superseded unsent notification without sending', async t => {
  const db = database(t); await saved(db);
  db.sql.prepare('UPDATE registered_products SET contact_name=? WHERE id=?').run('Corrected Synthetic', ID);
  assert.equal(event(db).payload, null); assert.equal(event(db).state, 'failed');
  assert.equal((await dispatch(db, () => assert.fail('superseded data'))).state, 'not_claimed');
});

test('post-save hook only sees validated saved registration, not client destination', async t => {
  const db = database(t); let hookCalls = 0;
  const request = new Request('https://example.com/api/registrations', { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json', Cookie: `${REGISTRATION_COOKIE_NAME}=${'ab'.repeat(32)}` }, body: JSON.stringify({ ...input, to: 'unexpected@example.com' }) });
  const response = await handleRegistrationRequest(request, db, { afterRegistration() { hookCalls++; } });
  assert.equal(response.status, 400); assert.equal(hookCalls, 0);
});
