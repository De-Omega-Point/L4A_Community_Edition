import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  REGISTRATION_COOKIE_NAME, REGISTRATION_NOTICE_VERSION, createReceipt, hashReceipt,
  receiptFromRequest, registerReceipt, validateRegistration,
} from '../server/registration/core.mjs';
import { handleRegistrationRequest, registrationAccess } from '../server/registration/provider.mjs';

const origin = 'https://example.test';
const uuid = '26a27e03-79eb-4cc7-bb82-c492d57d4302';
const rawReceipt = 'ab'.repeat(32); // Synthetic test receipt, never a real credential.
const otherReceipt = 'cd'.repeat(32);
const receiptHash = await hashReceipt(rawReceipt);
const input = { kind: 'business', contactName: 'Synthetic Owner', businessName: 'Synthetic Shop', email: 'owner@example.test', noticeVersion: REGISTRATION_NOTICE_VERSION, termsAccepted: true, privacyAcknowledged: true };
const schema = readFileSync(new URL('../drizzle/0003_yellow_nightshade.sql', import.meta.url), 'utf8');

function database({ withSchema = true, filename = ':memory:' } = {}) {
  const sqlite = new DatabaseSync(filename);
  if (withSchema) sqlite.exec(schema);
  const calls = [];
  const db = {
    sqlite, calls,
    prepare(sql) {
      return { bind(...params) {
        return {
          async first() { calls.push({ action: 'first', sql, params }); return sqlite.prepare(sql).get(...params) || null; },
          async run() { calls.push({ action: 'run', sql, params }); const result = sqlite.prepare(sql).run(...params); return { success: true, meta: { changes: Number(result.changes) } }; },
        };
      } };
    },
    rows() { return sqlite.prepare('SELECT * FROM registered_products').all(); },
    writes() { return calls.filter(call => call.action === 'run'); },
    close() { sqlite.close(); },
  };
  return db;
}
function request({ method = 'GET', path = '/api/registrations', receipt, body, headers = {}, ...options } = {}) {
  return new Request(`${origin}${path}`, {
    method,
    headers: { ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...(receipt === undefined ? {} : { Cookie: `${REGISTRATION_COOKIE_NAME}=${receipt}` }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' || body instanceof ReadableStream ? body : JSON.stringify(body) }), ...options,
  });
}
const register = (db, options = {}) => registerReceipt({ db, receiptHash, input, ...options });
const post = (db, options = {}) => handleRegistrationRequest(request({ method: 'POST', receipt: rawReceipt, body: input, ...options }), db);
const event = (db, name, options = {}) => post(db, { path: '/api/registration-events', body: { event: name }, ...options });
const cookieValue = response => response.headers.get('Set-Cookie')?.split(';')[0].split('=')[1];

function assertPrivateResponse(response) {
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Vary'), 'Cookie');
}

test('self-reported contact validation requires no auth provider or mandatory marketing', () => {
  assert.deepEqual(validateRegistration(input), { kind: 'business', contactName: input.contactName, businessName: input.businessName, email: input.email, marketingConsent: false });
  assert.equal(validateRegistration({ ...input, marketingConsent: true }).marketingConsent, true);
  assert.equal(validateRegistration({ ...input, kind: 'individual', businessName: '' }).businessName, null);
  const individual = { ...input, kind: 'individual' }; delete individual.businessName;
  assert.equal(validateRegistration(individual).businessName, null);
  assert.equal(validateRegistration({ ...input, email: ' OWNER@Example.Test ' }).email, 'owner@example.test');
  assert.equal(validateRegistration({ ...input, contactName: ' Synthetic Owner ' }).contactName, 'Synthetic Owner');
});

test('required fields, true acknowledgements and optional boolean marketing validate strictly', () => {
  for (const change of [
    { kind: 'unknown' }, { contactName: '' }, { contactName: ' ' }, { contactName: 5 }, { contactName: 'x'.repeat(121) }, { contactName: 'bad\nname' },
    { businessName: '' }, { businessName: null }, { businessName: 5 }, { businessName: 'x'.repeat(121) }, { kind: 'individual' },
    { email: 'bad' }, { email: 5 }, { email: 'x'.repeat(255) }, { email: 'a@..example.test' }, { email: 'a\n@example.test' },
    { termsAccepted: false }, { termsAccepted: 'true' }, { privacyAcknowledged: false }, { privacyAcknowledged: 'true' },
    { marketingConsent: 'false' }, { marketingConsent: 1 }, { marketingConsent: null },
  ]) assert.throws(() => validateRegistration({ ...input, ...change }), undefined, JSON.stringify(change));
  for (const value of [null, [], 'text', 1, true]) assert.throws(() => validateRegistration(value));
});

test('client IDs, customer records, auth claims and all extra fields are rejected', () => {
  for (const extra of [{ productId: uuid }, { id: uuid }, { customers: [] }, { receipt: rawReceipt }, { receipt_hash: receiptHash }, { emailVerified: true }, { ownerSubject: 'forged' }, { phone: '555' }, { displayName: 'legacy' }, { marketingConsentAt: 'now' }]) {
    assert.throws(() => validateRegistration({ ...input, ...extra }), /registration details only/);
  }
});

test('receipt uses 32 cryptographic bytes, distinct from public UUID and stored hash', async () => {
  const receipts = new Set(Array.from({ length: 1000 }, () => createReceipt()));
  assert.equal(receipts.size, 1000); // A sample, not a global uniqueness guarantee.
  for (const receipt of receipts) assert.match(receipt, /^[a-f0-9]{64}$/u);
  assert.match(receiptHash, /^[a-f0-9]{64}$/u);
  assert.notEqual(receiptHash, rawReceipt);
  assert.equal(await hashReceipt(rawReceipt), receiptHash);
  await assert.rejects(hashReceipt(uuid), /Allow cookies/);
});

test('GET issues secure host-only one-year receipt but never creates a registration', async t => {
  const db = database(); t.after(() => db.close());
  const first = await handleRegistrationRequest(request(), db);
  assert.equal(first.status, 200); assertPrivateResponse(first);
  assert.deepEqual(await first.json(), { cookieReady: false, registered: false });
  const cookie = first.headers.get('Set-Cookie');
  assert.match(cookie, /^__Host-l4a_registration=[a-f0-9]{64}; Path=\/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax$/u);
  assert.doesNotMatch(cookie, /Domain=/u);
  assert.equal(db.rows().length, 0); assert.equal(db.writes().length, 0);
  const second = await handleRegistrationRequest(request({ receipt: cookieValue(first) }), db);
  assert.deepEqual(await second.json(), { cookieReady: true, registered: false });
  assert.equal(second.headers.get('Set-Cookie'), null);
  assert.equal(db.writes().length, 0);
});

test('missing, malformed, public-UUID and ambiguous cookies cannot act as access receipts', async t => {
  const db = database(); t.after(() => db.close()); await register(db);
  for (const receipt of [undefined, '', uuid, receiptHash.toUpperCase(), 'x'.repeat(64), `${rawReceipt}; ${REGISTRATION_COOKIE_NAME}=${otherReceipt}`]) {
    const req = request({ receipt });
    assert.equal(receiptFromRequest(req), null);
    assert.equal(await registrationAccess(req, db), null);
    const response = await handleRegistrationRequest(req, db);
    assert.deepEqual(await response.json(), { cookieReady: false, registered: false });
    assert.match(cookieValue(response), /^[a-f0-9]{64}$/u);
  }
});

test('first POST returns server UUID, stores only digest and timestamps, and grants access', async t => {
  const db = database(); t.after(() => db.close());
  const response = await post(db); assert.equal(response.status, 201); assertPrivateResponse(response);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['created', 'productId', 'registered']);
  assert.equal(body.created, true); assert.equal(body.registered, true);
  assert.match(body.productId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  const [row] = db.rows();
  assert.equal(row.id, body.productId); assert.equal(row.receipt_hash, receiptHash);
  assert.equal(row.contact_name, input.contactName); assert.equal(row.business_name, input.businessName); assert.equal(row.email, input.email);
  assert.equal(row.marketing_consent, 0); assert.equal(row.marketing_consent_at, null); assert.equal(row.marketing_consent_version, null);
  assert.equal(row.terms_version, REGISTRATION_NOTICE_VERSION); assert.equal(row.privacy_version, REGISTRATION_NOTICE_VERSION);
  for (const key of ['registered_at', 'terms_accepted_at', 'privacy_acknowledged_at']) assert.equal(row[key], row.created_at);
  assert.deepEqual(await registrationAccess(request({ receipt: rawReceipt }), db), { id: row.id, kind: row.kind, createdAt: row.created_at });
  assert.doesNotMatch(JSON.stringify(body), /email|contact|receipt|hash/iu);
  assert.equal(Object.values(row).includes(rawReceipt), false);
  assert.equal(db.calls.some(call => call.params.includes(rawReceipt)), false);
});

test('marketing consent timestamps/version exist only for explicit opt-in', async t => {
  const db = database(); t.after(() => db.close());
  const result = await register(db, { input: { ...input, marketingConsent: true }, now: () => new Date('2026-10-17T12:00:00Z') });
  assert.equal(result.created, true);
  const [row] = db.rows();
  assert.equal(row.marketing_consent, 1);
  assert.equal(row.marketing_consent_at, '2026-10-17T12:00:00.000Z');
  assert.equal(row.marketing_consent_version, REGISTRATION_NOTICE_VERSION);
});

test('returning GET reveals minimal status and public UUID, not supplied contact or consent data', async t => {
  const db = database(); t.after(() => db.close()); const result = await register(db);
  const response = await handleRegistrationRequest(request({ receipt: rawReceipt }), db);
  assert.deepEqual(await response.json(), { cookieReady: true, registered: true, productId: result.registration.id });
  assert.equal(response.headers.get('Set-Cookie'), null);
});

test('repeated registration keeps the original row, name and consent without another write', async t => {
  const db = database(); t.after(() => db.close()); const first = await post(db); const original = structuredClone(db.rows()[0]);
  const second = await post(db, { body: { ...input, contactName: 'Unrequested rename', email: 'changed@example.test', marketingConsent: true } });
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { registered: true, productId: (await first.json()).productId, created: false });
  assert.deepEqual({ ...db.rows()[0] }, original);
  assert.equal(db.writes().length, 1);
});

test('concurrent registration is atomic and converges to one ID and one saved consent', async t => {
  const db = database(); t.after(() => db.close());
  const results = await Promise.all(Array.from({ length: 24 }, () => register(db)));
  assert.equal(new Set(results.map(result => result.registration.id)).size, 1);
  assert.equal(results.filter(result => result.created).length, 1); assert.equal(db.rows().length, 1);
});

test('same email in a different browser cannot claim, recover or modify an existing Product ID', async t => {
  const db = database(); t.after(() => db.close()); const first = await register(db);
  assert.equal(await registrationAccess(request({ receipt: otherReceipt }), db), null);
  await assert.rejects(register(db, { receiptHash: await hashReceipt(otherReceipt) }), error => error.code === 'registration_review_needed' && error.status === 409);
  assert.equal(db.rows().length, 1);
  const forged = request({ headers: { 'x-product-id': first.registration.id, Authorization: `Bearer ${first.registration.id}`, 'oai-authenticated-user-email': input.email } });
  assert.equal(await registrationAccess(forged, db), null);
  assert.equal(await registrationAccess(request({ receipt: receiptHash }), db), null, 'database digest is not a bearer cookie');
});

test('POST requires returned cookie shape, same-origin Origin and application/json before writing', async t => {
  const db = database(); t.after(() => db.close());
  for (const [options, expected] of [
    [{ receipt: undefined }, 409], [{ receipt: uuid }, 409], [{ headers: { Origin: '' } }, 403],
    [{ headers: { Origin: 'null' } }, 403], [{ headers: { Origin: 'https://attacker.test' } }, 403],
    [{ headers: { Origin: `${origin}.attacker.test` } }, 403], [{ headers: { 'Content-Type': 'text/plain' } }, 415],
    [{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 415],
  ]) {
    const response = await post(db, options); assert.equal(response.status, expected, JSON.stringify(options)); assertPrivateResponse(response);
  }
  assert.equal(db.writes().length, 0);
  const valid = await post(db, { headers: { 'Content-Type': 'application/json; charset=utf-8' } }); assert.equal(valid.status, 201);
});

test('invalid JSON, acknowledgements, unknown fields and client customer data never persist', async t => {
  const db = database(); t.after(() => db.close());
  for (const body of ['{', 'null', '[]', { ...input, termsAccepted: false }, { ...input, privacyAcknowledged: false }, { ...input, marketingConsent: null }, { ...input, customers: [{ email: 'customer@example.test' }] }, { ...input, productId: uuid }]) {
    const response = await post(db, { body }); assert.equal(response.status, 400); assert.equal(db.rows().length, 0);
  }
  assert.equal(db.writes().length, 0);
});

test('request body is bounded by actual bytes even without or despite content length', async t => {
  const db = database(); t.after(() => db.close());
  for (const options of [
    { body: 'x'.repeat(4097) },
    { body: 'x'.repeat(4097), headers: { 'Content-Length': '1' } },
    { body: '{}', headers: { 'Content-Length': '4097' } },
    { body: JSON.stringify({ ...input, contactName: '😀'.repeat(1100) }) },
  ]) assert.equal((await post(db, options)).status, 413);
  assert.equal(db.writes().length, 0);
  const padded = `${JSON.stringify(input)}${' '.repeat(4096 - Buffer.byteLength(JSON.stringify(input)))}`;
  assert.equal((await post(db, { body: padded })).status, 201);
});

test('streaming payload cancels immediately once its byte limit is exceeded', async t => {
  const db = database(); t.after(() => db.close()); let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4097)); }, cancel() { cancelled = true; } });
  const response = await post(db, { body: stream, duplex: 'half' });
  assert.equal(response.status, 413); assert.equal(cancelled, true); assert.equal(db.writes().length, 0);
});

test('invalid UTF-8 is rejected without data writes', async t => {
  const db = database(); t.after(() => db.close());
  const req = new Request(`${origin}/api/registrations`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `${REGISTRATION_COOKIE_NAME}=${rawReceipt}` }, body: new Uint8Array([0xff]) });
  assert.equal((await handleRegistrationRequest(req, db)).status, 400); assert.equal(db.writes().length, 0);
});

test('missing D1 or schema fails closed with 503, without setting a cookie or leaking an error', async t => {
  const missingSchema = database({ withSchema: false }); t.after(() => missingSchema.close());
  const corrupt = { prepare() { throw new Error(`secret database error ${rawReceipt} ${input.email}`); } };
  for (const db of [undefined, null, {}, missingSchema, corrupt]) {
    for (const req of [request(), request({ receipt: rawReceipt }), request({ method: 'POST', receipt: rawReceipt, body: input })]) {
      const response = await handleRegistrationRequest(req, db);
      assert.equal(response.status, 503); assertPrivateResponse(response); assert.equal(response.headers.get('Set-Cookie'), null);
      const body = await response.text(); assert.doesNotMatch(body, new RegExp(`${rawReceipt}|${input.email}|secret database|no such table`, 'u'));
    }
    await assert.rejects(registrationAccess(request(), db), error => error.code === 'service_unavailable' && error.status === 503);
    await assert.rejects(registrationAccess(request({ receipt: rawReceipt }), db), error => error.code === 'service_unavailable');
  }
});

test('only a true UUID collision retries; invalid randomness and ignored/failing storage fail closed', async t => {
  const db = database(); t.after(() => db.close()); await register(db, { randomUUID: () => uuid });
  let count = 0;
  const second = await register(db, { receiptHash: await hashReceipt(otherReceipt), input:{...input,email:'second@example.test'}, randomUUID: () => ++count === 1 ? uuid : crypto.randomUUID() });
  assert.equal(count, 2); assert.notEqual(second.registration.id, uuid);
  let bounded = 0;
  await assert.rejects(register(db, { receiptHash: await hashReceipt('ef'.repeat(32)), input:{...input,email:'third@example.test'}, randomUUID: () => { bounded++; return uuid; } }), error => error.code === 'id_unavailable');
  assert.equal(bounded, 3);
  for (const badId of ['bad-id', '', '26a27e03-79eb-1cc7-bb82-c492d57d4302']) {
    await assert.rejects(register(db, { receiptHash: await hashReceipt('12'.repeat(32)), randomUUID: () => badId }), /secure registration ID/u);
  }
  for (const failure of ['throw', 'false', 'ignored', 'ambiguous']) {
    let attempts = 0;
    const failing = { prepare() { return { bind() { return { first: async () => null, run: async () => {
      attempts++;
      if (failure === 'throw') throw new Error('synthetic storage failure');
      if (failure === 'false') return { success: false, meta: { changes: 1 } };
      if (failure === 'ambiguous') return { success: true };
      return { success: true, meta: { changes: 0 } };
    } }; } }; } };
    await assert.rejects(register(failing)); assert.equal(attempts, 1, failure);
    const response = await post(failing); assert.equal(response.status, 503); assert.equal(attempts, 2, failure);
  }
});

test('events require an existing receipt row; an email or public ID is never enough', async t => {
  const db = database(); t.after(() => db.close());
  assert.equal((await event(db, 'app_opened')).status, 403);
  await register(db);
  assert.equal((await event(db, 'app_opened', { receipt: otherReceipt })).status, 403);
  assert.equal((await event(db, 'app_opened', { receipt: uuid })).status, 409);
  assert.equal((await event(db, 'app_opened', { headers: { Origin: 'https://attacker.test' } })).status, 403);
});

test('events are enum-only, contain no personal tracking, and preserve the first timestamp on repeats', async t => {
  const db = database(); t.after(() => db.close()); await register(db);
  for (const name of ['app_opened', 'install_requested', 'install_observed']) {
    const response = await event(db, name); assert.equal(response.status, 200); assertPrivateResponse(response);
    assert.deepEqual(await response.json(), { recorded: true, event: name });
    const field = `${name}_at`;
    const first = db.rows()[0][field]; assert.match(first, /^\d{4}-\d{2}-\d{2}T/u);
    const changesBefore = db.sqlite.prepare('SELECT total_changes() AS count').get().count;
    await Promise.all(Array.from({ length: 8 }, () => event(db, name)));
    assert.equal(db.rows()[0][field], first);
    assert.equal(db.sqlite.prepare('SELECT total_changes() AS count').get().count, changesBefore);
  }
  for (const body of [{ event: 'downloaded' }, { event: ['app_opened'] }, { event: '__proto__' }, { event: null }, { event: 'app_opened', ip: '127.0.0.1' }, { event: 'app_opened', userAgent: 'synthetic' }, { event: 'app_opened', url: 'https://example.test/' }, { event: 'app_opened', timestamp: 'earlier' }, { event: 'app_opened', customers: [] }, {}, []]) {
    assert.equal((await post(db, { path: '/api/registration-events', body })).status, 400);
  }
  const row = db.rows()[0];
  for (const forbidden of ['ip', 'user_agent', 'url', 'customers', 'download_count']) assert.equal(Object.hasOwn(row, forbidden), false);
});

test('event database errors cannot report recorded success', async () => {
  const db = { prepare(sql) { return { bind() { return { first: async () => ({ id: uuid, kind: 'business', created_at: '2026-10-17T12:00:00Z' }), run: async () => { assert.match(sql, /^UPDATE/u); throw new Error('synthetic failure'); } }; } }; } };
  const response = await event(db, 'app_opened'); assert.equal(response.status, 503);
  assert.equal(Object.hasOwn(await response.json(), 'recorded'), false);
});

test('unsupported API paths and methods never perform storage operations', async t => {
  const db = database(); t.after(() => db.close());
  for (const [options, expected, allow] of [
    [{ path: '/api/unknown' }, 404, null], [{ method: 'DELETE' }, 405, 'GET, POST'],
    [{ method: 'GET', path: '/api/registration-events' }, 405, 'POST'], [{ method: 'PUT', path: '/api/registration-events' }, 405, 'POST'],
  ]) { const response = await handleRegistrationRequest(request(options), db); assert.equal(response.status, expected); assert.equal(response.headers.get('Allow'), allow); assertPrivateResponse(response); }
  assert.equal(db.calls.length, 0);
});

test('standalone SQL constraints preserve legacy records and forbid inconsistent consent', async t => {
  const db = database({ withSchema: false }); t.after(() => db.close());
  db.sqlite.exec("CREATE TABLE community_registrations (id TEXT, product_id TEXT); INSERT INTO community_registrations VALUES ('legacy', 'LFA-LOCAL-23456789');");
  db.sqlite.exec(schema); await register(db);
  assert.deepEqual({ ...db.sqlite.prepare('SELECT * FROM community_registrations').get() }, { id: 'legacy', product_id: 'LFA-LOCAL-23456789' });
  assert.throws(() => db.sqlite.prepare('UPDATE registered_products SET marketing_consent = 1').run(), /CHECK constraint/u);
  assert.throws(() => db.sqlite.prepare("UPDATE registered_products SET receipt_hash = 'bad'").run(), /CHECK constraint/u);
  assert.throws(() => db.sqlite.prepare("UPDATE registered_products SET kind = 'individual'").run(), /CHECK constraint/u);
  assert.match(schema, /CREATE TABLE `registered_products`/u);
  assert.match(schema, /CREATE UNIQUE INDEX `registered_products_receipt_hash_unique`/u);
  assert.doesNotMatch(schema, /DROP TABLE|ALTER TABLE|community_registrations\s*\(/u);
});


test('stored receipt and original consent survive closing and reopening a synthetic SQLite database', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'l4a-registration-synthetic-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'registration.sqlite');
  const first = database({ filename });
  const result = await register(first, { input: { ...input, marketingConsent: true } });
  const original = structuredClone(first.rows()[0]); first.close();
  const reopened = database({ filename, withSchema: false }); t.after(() => reopened.close());
  assert.deepEqual(await registrationAccess(request({ receipt: rawReceipt }), reopened), result.registration);
  const duplicate = await post(reopened);
  assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).productId, result.registration.id);
  assert.deepEqual({ ...reopened.rows()[0] }, original); assert.equal(reopened.writes().length, 0);
});


test('new registration rejects absent or stale notice version without a write', async t => {
  const db = database(); t.after(() => db.close());
  for (const version of [undefined, '2026-10-17-registration-1', null]) {
    await assert.rejects(register(db, { input: { ...input, noticeVersion: version } }), error => error.code === 'notice_changed' && error.status === 422);
    assert.equal(db.rows().length, 0);
  }
});
test('existing receipt retry keeps historical notice acknowledgement unchanged', async t => {
  const db = database(); t.after(() => db.close()); await register(db);
  db.sqlite.prepare('UPDATE registered_products SET terms_version=?,privacy_version=?').run('2026-10-17-registration-1','2026-10-17-registration-1');
  const before = structuredClone(db.rows()[0]);
  for (const version of [undefined, '2026-10-17-registration-1', REGISTRATION_NOTICE_VERSION]) {
    const result = await register(db, { input: { ...input, noticeVersion: version } });
    assert.equal(result.created, false); assert.deepEqual({ ...db.rows()[0] }, before);
  }
});


test('normalized email dedupe is atomic across different receipts without revealing or relinking identity', async t => {
 const db=database();t.after(()=>db.close());
 const results=await Promise.allSettled(Array.from({length:16},(_,i)=>register(db,{receiptHash:i.toString(16).padStart(64,'0'),input:{...input,email:i%2?' OWNER@EXAMPLE.TEST ':input.email}})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(db.rows().length,1);
 for(const result of results.filter(r=>r.status==='rejected')) assert.equal(result.reason.code,'registration_review_needed');
 const res=await post(db,{receipt:otherReceipt});const body=await res.json();
 assert.equal(res.status,409);assert.equal(body.code,'registration_review_needed');
 assert.equal(body.productId,undefined);assert.doesNotMatch(JSON.stringify(body),/owner@example|Synthetic Owner|Synthetic Shop/);
 assert.equal(await registrationAccess(request({receipt:otherReceipt}),db),null);
});


test('legacy duplicate emails retain each legitimate receipt and all existing data', async t => {
 const db=database();t.after(()=>db.close());const first=await register(db);const original=db.rows()[0];
 const legacy={...original,id:crypto.randomUUID(),receipt_hash:await hashReceipt(otherReceipt)};
 const columns=Object.keys(legacy);db.sqlite.prepare(`INSERT INTO registered_products (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...Object.values(legacy));
 const before=structuredClone(db.rows());
 assert.equal((await register(db)).registration.id,first.registration.id);
 assert.equal((await register(db,{receiptHash:legacy.receipt_hash})).registration.id,legacy.id);
 await assert.rejects(register(db,{receiptHash:'ef'.repeat(32)}),e=>e.code==='registration_review_needed');
 assert.equal(JSON.stringify(db.rows()),JSON.stringify(before));
});
