import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedProductId, readMembershipPayload } from '../app/api/community-members/input.mjs';

test('membership accepts new local and historical CE identities without regenerating them', () => {
  for (const id of ['LFA-LOCAL-23456789', 'LFA-CE-ABCDEFGH']) assert.equal(isSupportedProductId(id), true);
  for (const id of ['', 'LFA-LOCAL-12345678', 'LFA-CE-ABCDEFGHI', 'LFA-CE-ABCD EFG', 'LFA-PAID-23456789']) {
    assert.equal(isSupportedProductId(id), false);
  }
});

function request(body, headers = {}) {
  return new Request('https://example.test/api/community-members', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body
  });
}

test('membership input accepts a bounded JSON object with Unicode', async () => {
  const body = { businessName: 'Synthetic Café', updatesConsent: true };
  assert.deepEqual(await readMembershipPayload(request(JSON.stringify(body))), { body });
});

test('malformed and non-object JSON is rejected as a client error', async () => {
  for (const body of ['{', 'null', '[]', 'false', '42', '"text"', '']) {
    assert.equal((await readMembershipPayload(request(body))).status, 400);
  }
});

test('membership input rejects non-JSON and oversized declared bodies', async () => {
  assert.equal((await readMembershipPayload(request('{}', { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await readMembershipPayload(request('{}', { 'content-length': '20001' }))).status, 413);
});

test('actual body bytes are bounded even without or with a false Content-Length', async () => {
  for (const headers of [{}, { 'content-length': '2' }]) {
    assert.equal((await readMembershipPayload(request(JSON.stringify({ text: 'é'.repeat(11000) }), headers))).status, 413);
  }
});

test('oversized streaming input is cancelled before consuming the rest', async () => {
  let cancelled = false, produced = 0;
  const body = new ReadableStream({
    pull(controller) { produced++; controller.enqueue(new Uint8Array(10000)); },
    cancel() { cancelled = true; }
  });
  const response = await readMembershipPayload(new Request('https://example.test', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half'
  }));
  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
  assert(produced <= 4);
});

test('invalid UTF-8 and interrupted body streams return truthful errors', async () => {
  assert.equal((await readMembershipPayload(request(new Uint8Array([0xff])))).status, 400);
  const body = new ReadableStream({ start(controller) { controller.error(new Error('interrupted')); } });
  assert.equal((await readMembershipPayload(new Request('https://example.test', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half'
  }))).status, 400);
});
