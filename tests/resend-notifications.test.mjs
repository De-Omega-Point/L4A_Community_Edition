import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationConfiguration, resendConfiguration, createResendNotificationSender, OWNER_NOTIFICATION_TO } from '../server/registration/email-notifications.mjs';
const env = { REGISTRATION_EMAIL_READY: 'confirmed', REGISTRATION_EMAIL_PROVIDER: 'resend', REGISTRATION_EMAIL_MODE: 'production', RESEND_API_KEY: 'synthetic-not-real-key', REGISTRATION_EMAIL_FROM: 'notify@example.com', RESEND_SENDER_VERIFIED: 'confirmed' };
const details = { name: 'SYNTHETIC TEST Owner', businessName: 'Synthetic Business', email: 'synthetic@example.com', productId: '11111111-1111-4111-8111-111111111111', registeredAt: '2026-10-28T00:00:00.000Z', marketingConsent: false };
const providerId = '22222222-2222-4222-8222-222222222222';
const key = `l4a-registration:${details.productId}`;
const cfg = () => notificationConfiguration(env);

test('Resend config is explicit, off without secret/readiness/verified sender/mode', () => {
  assert.equal(notificationConfiguration({}), null); assert.equal(cfg().provider, 'resend');
  for (const bad of [{ REGISTRATION_EMAIL_READY: '' }, { RESEND_API_KEY: '' }, { REGISTRATION_EMAIL_MODE: '' }, { RESEND_SENDER_VERIFIED: '' }, { REGISTRATION_EMAIL_FROM: 'onboarding@resend.dev' }, { REGISTRATION_EMAIL_FROM: 'x\nBcc:y@example.com' }, { REGISTRATION_EMAIL_PROVIDER: 'unapproved' }]) assert.equal(notificationConfiguration({ ...env, ...bad }), null);
});
test('sandbox requires fixed owner account email and exact testing sender', async () => {
  const sandbox = { ...env, REGISTRATION_EMAIL_MODE: 'sandbox', REGISTRATION_EMAIL_FROM: 'onboarding@resend.dev', RESEND_ACCOUNT_EMAIL: OWNER_NOTIFICATION_TO };
  assert.equal(resendConfiguration({ ...sandbox, RESEND_ACCOUNT_EMAIL: 'other@example.com' }), null);
  assert.equal(resendConfiguration({ ...sandbox, RESEND_ACCOUNT_EMAIL: 'deomegapoint@gmail.com' }), null);
  assert.ok(resendConfiguration({ ...sandbox, RESEND_ACCOUNT_EMAIL: 'hello@de-omega-point.com' }));
  assert.equal(OWNER_NOTIFICATION_TO, 'Hello@De-Omega-Point.Com');
  assert.equal(resendConfiguration({ ...sandbox, REGISTRATION_EMAIL_FROM: 'other@resend.dev' }), null);
  const send = createResendNotificationSender(resendConfiguration(sandbox), async () => Response.json({ id: providerId }));
  assert.equal((await send({ key, details })).state, 'accepted');
  assert.equal((await send({ key, details: { ...details, name: 'Real Person' } })).state, 'failed');
  assert.equal((await send({ key, details: { ...details, email: 'actual@business.com' } })).state, 'failed');
});
test('Resend POST is pinned, plain text, fixed owner, seven approved fields, stable idempotency', async () => {
  const requests = [];
  const config = notificationConfiguration({ ...env, REGISTRATION_EMAIL_ENDPOINT: 'https://evil.example/exfiltrate', REGISTRATION_EMAIL_ORIGIN: 'https://evil.example' });
  const send = createResendNotificationSender(config, async (url, options) => { requests.push({ url, ...options }); return Response.json({ id: providerId }); });
  assert.deepEqual(await send({ key, details }), { state: 'accepted', providerId });
  const req = requests[0]; const body = JSON.parse(req.body);
  assert.equal(req.url, 'https://api.resend.com/emails'); assert.equal(req.method, 'POST'); assert.equal(req.redirect, 'error');
  assert.equal(req.headers.Authorization, `Bearer ${env.RESEND_API_KEY}`); assert.equal(req.headers['Idempotency-Key'], key);
  assert.deepEqual(Object.keys(body).sort(), ['from', 'subject', 'text', 'to']); assert.deepEqual(body.to, [OWNER_NOTIFICATION_TO]);
  assert.match(body.text, /Marketing consent: No/u); assert.match(body.text, /Product ID: 11111111/u);
  assert.doesNotMatch(req.body, /password|receipt|customer|Bearer|synthetic-not-real-key|html|reply_to/iu);
});
test('only valid successful provider id counts as acceptance', async () => {
  for (const response of [Response.json({}), Response.json({ id: 'invalid' }), Response.json({ id: providerId }, { status: 500 }), Response.json({ id: providerId }, { status: 302 }), new Response('invalid json'), new Response('x'.repeat(3000))]) {
    assert.equal((await createResendNotificationSender(cfg(), async () => response)({ key, details })).state, 'uncertain');
  }
});
test('timeout, 408, 409 and 5xx are uncertain; known 4xx stops for review, no automatic resend', async () => {
  const error = { name: 'synthetic_error', message: 'No private values echoed' };
  for (const status of [408, 409, 500, 503]) assert.equal((await createResendNotificationSender(cfg(), async () => Response.json(error, { status }))({ key, details })).state, 'uncertain');
  for (const status of [400, 401, 403, 404, 405, 413, 422, 429]) assert.equal((await createResendNotificationSender(cfg(), async () => Response.json(error, { status }))({ key, details })).state, 'failed');
  assert.equal((await createResendNotificationSender(cfg(), async () => { throw new Error('Timeout'); })({ key, details })).state, 'uncertain');
});
