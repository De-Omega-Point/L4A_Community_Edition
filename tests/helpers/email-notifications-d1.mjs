// Synthetic, in-memory Miniflare D1 only. Never opens any remote database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { registerReceipt, REGISTRATION_NOTICE_VERSION } from '../../server/registration/core.mjs';
import { dispatchRegistrationNotification } from '../../server/registration/email-notifications.mjs';
const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("local synthetic only"); } }', compatibilityDate: '2026-03-27', d1Databases: ['DB'], d1Persist: false });
try {
  const db = await mf.getD1Database('DB');
  for (const statement of readFileSync('drizzle/0003_yellow_nightshade.sql', 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  const proposal = readFileSync('docs/proposed-sql/registration-email-outbox.sql', 'utf8');
  const statements = proposal.match(/CREATE TABLE[\s\S]*?\n\);|CREATE TRIGGER[\s\S]*?\nEND;/gu);
  assert.equal(statements.length, 3);
  for (const statement of statements) await db.prepare(statement).run();
  const input = { kind: 'business', contactName: 'Synthetic Owner', businessName: 'Synthetic Shop', email: 'synthetic@example.com', termsAccepted: true, privacyAcknowledged: true, marketingConsent: false, noticeVersion: REGISTRATION_NOTICE_VERSION };
  const receiptHash = 'a'.repeat(64);
  const first = await registerReceipt({ db, receiptHash, input }); assert.equal(first.created, true);
  assert.equal((await registerReceipt({ db, receiptHash, input })).created, false);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM registration_email_outbox').first()).n, 1);
  let sent = 0;
  const args = { db, productId: first.registration.id, now: () => Date.now() + 2000, send: async () => { sent++; return { state: 'accepted', providerId: 'local-only' }; } };
  const results = await Promise.all([dispatchRegistrationNotification(args), dispatchRegistrationNotification(args)]);
  assert.equal(sent, 1); assert.equal(results.filter(r => r.state === 'accepted').length, 1);
  const row = await db.prepare('SELECT payload,state FROM registration_email_outbox WHERE product_id = ?').bind(first.registration.id).first();
  assert.equal(row.payload, null); assert.equal(row.state, 'accepted');
  await db.prepare('DELETE FROM registered_products WHERE id = ?').bind(first.registration.id).run();
  assert.equal(await db.prepare('SELECT product_id FROM registration_email_outbox WHERE product_id = ?').bind(first.registration.id).first(), null);
  await db.prepare("CREATE TRIGGER synthetic_queue_failure BEFORE INSERT ON registration_email_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();
  await assert.rejects(registerReceipt({ db, receiptHash: 'b'.repeat(64), input }));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM registered_products').first()).n, 0);
  console.log('PASS: local Miniflare D1 atomic trigger, repeated registration, concurrent sender, accepted payload clearing, FK deletion and rollback. Mock send only.');
} finally { await mf.dispose(); }
