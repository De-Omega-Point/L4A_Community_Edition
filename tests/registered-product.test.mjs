import test from 'node:test';
import assert from 'node:assert/strict';
import { readRegisteredProduct, productPresentation } from '../public/community/js/registered-product.js';
const id = '12345678-1234-4123-8123-123456789abc';
const response = data => async () => ({ ok: true, json: async () => data });
test('only same-origin server receipt response supplies registered ID', async () => {
  const result = await readRegisteredProduct({ online: true, fetcher: async (url, options) => {
    assert.equal(url, '/api/registrations');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
    return { ok: true, json: async () => ({ registered: true, cookieReady: true, productId: id }) };
  }});
  assert.deepEqual(result, { state: 'verified', productId: id });
});
test('offline never requests server or displays a cached registration', async () => {
  assert.deepEqual(await readRegisteredProduct({ online: false, fetcher: () => assert.fail('network') }), { state: 'offline' });
});
test('arbitrary, local, malformed and unverified IDs never display', async () => {
  for (const data of [null, {registered: true, cookieReady: true, productId: [id]}, {registered: true, cookieReady: true, productId: {}}, {registered: true, productId: id}, {registered: true, cookieReady: true, productId: 'LFA-LOCAL-TEST'}, {registered: false, productId: id}, {registered: true, cookieReady: true, productId: '<script>'}]) {
    const result = await readRegisteredProduct({ online: true, fetcher: response(data) });
    assert.notEqual(result.state, 'verified');
    assert.equal(result.productId, undefined);
  }
});
test('network failure and server failure differ from unlinked', async () => {
  for (const fetcher of [async () => {throw Error('offline');}, async () => ({ok:false}), response({})]) {
    assert.deepEqual(await readRegisteredProduct({online:true, fetcher}), {state:'unavailable'});
  }
  assert.deepEqual(await readRegisteredProduct({online:true, fetcher:response({registered:false})}), {state:'unlinked'});
});
test('restore and offline guidance never promises recovery or sync', () => {
  assert.match(productPresentation({state:'unlinked'})[1], /backup does not restore/);
  assert.match(productPresentation({state:'offline'})[1], /backup does not restore/);
  assert.match(productPresentation({state:'verified',productId:id})[1], /not ownership/);
});
test('offline and overlapping checks cannot revive an obsolete verified ID', async () => {
  const { mountRegisteredProduct } = await import('../public/community/js/registered-product.js');
  const nodes = Object.fromEntries(['registeredProductId','registeredProductStatus','btnCheckRegistration'].map(name => [name, Object.assign(new EventTarget(), {textContent:'',disabled:false})]));
  const target = new EventTarget(); const pending = [];
  mountRegisteredProduct({document:{getElementById:name=>nodes[name]},target,read:()=>new Promise(resolve=>pending.push(resolve))});
  target.dispatchEvent(new Event('offline'));
  pending.shift()({state:'verified',productId:id});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes.registeredProductId.textContent,'Not verified while offline');
  nodes.btnCheckRegistration.dispatchEvent(new Event('click'));
  target.dispatchEvent(new Event('online'));
  pending[1]({state:'unlinked'}); pending[0]({state:'verified',productId:id});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes.registeredProductId.textContent,'No registration linked to this browser');
  assert.equal(nodes.btnCheckRegistration.disabled,false);
});
