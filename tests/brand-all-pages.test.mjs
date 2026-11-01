import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('current app routes reuse authentic product branding including recoverable errors', () => {
  assert.match(read('app/product-brand.tsx'), /<strong>Loyalty4All<\/strong>/);
  assert.match(read('app/product-brand.tsx'), /\/community\/assets\/loyalty-4-all-logo\.png/);
  for (const route of ['app/page.tsx', 'app/register/page.tsx', 'app/not-found.tsx', 'app/error.tsx', 'app/global-error.tsx']) {
    assert.match(read(route), /<ProductBrand\s*\/>/, route);
  }
  const shell = read('public/community/index.html');
  assert.match(shell, /<header class="app-header">[\s\S]*?<strong>Loyalty4All<\/strong>/);
  // One persistent shell header covers dashboard/customer/reward/settings/help screens.
  assert(shell.indexOf('class="app-header"') < shell.indexOf('id="screen-'));
});
test('current legal pages have visible product header without changing operator identity', () => {
  for (const dir of ['public/community', 'public/registration/notices/2026-10-28-registration-3']) {
    for (const name of ['privacy', 'terms']) {
      const html = read(`${dir}/${name}.html`);
      assert.match(html, /<header class="l4a-product-header"[\s\S]*?<strong>Loyalty4All<\/strong>/);
      assert.match(html, /De[‑-]Omega[‑-]Point/);
    }
  }
});

test('built public and not-found HTML render the product brand without database access', async () => {
  const worker = (await import('../dist/server/index.js')).default;
  const env = { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } };
  for (const path of ['/', '/register', '/not-a-real-page-brand-check']) {
    const response = await worker.fetch(new Request('https://example.test' + path, { headers: { accept: 'text/html' } }), env, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, path.includes('not-a-real') ? 404 : 200);
    const html = await response.text();
    assert.match(html, /<strong>Loyalty4All<\/strong>/, path);
    assert.match(html, /loyalty-4-all-logo\.png/, path);
  }
});
