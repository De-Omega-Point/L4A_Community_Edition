import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRODUCT_BRAND_HTML, brandedErrorResponse, addProductBrandChrome, isHtmlNavigation } from '../server/product-brand.mjs';
import { ownerRegistrations } from '../server/registration/owner.mjs';
const request = path => new Request(`https://example.com${path}`, { headers: { Accept: 'text/html' } });
const logo = '/community/assets/loyalty-4-all-logo.png';

test('owner setup and access denied screens carry product branding without opening data access', async () => {
  for (const [env, status] of [[{}, 503], [{ REGISTRATION_OWNER_ACCESS_READY: 'confirmed', REGISTRATION_OWNER_SITE_USER_ID: 'owner' }, 401]]) {
    const response = await ownerRegistrations(request('/owner/registrations'), env);
    assert.equal(response.status, status); assert.match(response.headers.get('Cache-Control'), /no-store/u);
    assert.ok((await response.text()).includes(PRODUCT_BRAND_HTML));
  }
});
test('navigation failures branded while API and non-navigation errors keep wire format/status', async () => {
  const page = brandedErrorResponse(request('/unknown'), '<Not found>', 404);
  assert.equal(page.status, 404); assert.match(page.headers.get('Content-Type'), /text\/html/u);
  const html = await page.text(); assert.ok(html.includes(logo)); assert.ok(html.includes('&lt;Not found&gt;'));
  const api = brandedErrorResponse(request('/api/unknown'), 'Not found', 404);
  assert.equal(await api.text(), 'Not found'); assert.equal(isHtmlNavigation(request('/api/unknown')), false);
  const plain = brandedErrorResponse(new Request('https://example.com/unknown'), 'Not found', 404);
  assert.equal(await plain.text(), 'Not found');
});
test('historical notice chrome adds no legal changes and no duplicate brand', async () => {
  for (const version of ['2026-10-17-registration-1']) for (const kind of ['privacy', 'terms']) {
    const original = readFileSync(`public/registration/notices/${version}/${kind}.html`, 'utf8');
    const response = await addProductBrandChrome(new Response(original, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', ETag: 'old', 'Content-Length': String(original.length) } }));
    const branded = await response.text(); assert.ok(branded.includes(PRODUCT_BRAND_HTML));
    assert.equal(branded.replace(PRODUCT_BRAND_HTML, ''), original);
    assert.equal(response.headers.get('ETag'), null); assert.equal(response.headers.get('Content-Length'), null);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const twice = await addProductBrandChrome(new Response(branded, { headers: { 'Content-Type': 'text/html' } }));
    assert.equal(await twice.text(), branded);
  }
});
test('wrapper leaves JSON, HEAD and redirects intact', async () => {
  const json = Response.json({ error: 'no' }); assert.equal(await addProductBrandChrome(json), json);
  const head = new Response(null, { headers: { 'Content-Type': 'text/html' } }); assert.equal(await addProductBrandChrome(head, { head: true }), head);
  const redirect = new Response(null, { status: 303, headers: { Location: '/register' } }); assert.equal(await addProductBrandChrome(redirect), redirect);
});

test('product header retains visible accessible name when image unavailable', () => {
  assert.match(PRODUCT_BRAND_HTML, /<strong>Loyalty4All<\/strong>/u);
  assert.match(PRODUCT_BRAND_HTML, /<span>Community Edition<\/span>/u);
  assert.match(PRODUCT_BRAND_HTML, /aria-label="Loyalty4All home"/u);
  assert.match(PRODUCT_BRAND_HTML, /alt=""/u);
});
