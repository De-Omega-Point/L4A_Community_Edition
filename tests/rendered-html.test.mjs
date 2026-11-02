import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { collectPublicAssets } from '../build/protected-community-assets.mjs';

const developmentPreviewMeta = /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;
const ctx = { waitUntil() {}, passThroughOnException() {} };
const origin = 'https://example.test';
const worker = async () => (await import(new URL('../dist/server/index.js', import.meta.url).href)).default;
const noAssets = { fetch: async () => new Response('Not found', { status: 404 }) };

test('renders the public product page with the single registration entry and no development metadata', async () => {
  const response = await (await worker()).fetch(new Request(`${origin}/`, { headers: { accept: 'text/html' } }), { ASSETS: noAssets }, ctx);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/i);
  const html = await response.text();
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.match(html, /Loyalty-4-All/);
  assert.match(html, /Start using Loyalty4All/);
  assert.match(html, /href="\/community\/register"/);
  assert.doesNotMatch(html, /href="\/community\/"/);
});

test('packages only public Community legal notices, never the app shell, in static assets', () => {
  for (const file of ['privacy.html', 'terms.html']) {
    const source = readFileSync(new URL(`../public/community/${file}`, import.meta.url), 'utf8');
    const packaged = readFileSync(new URL(`../dist/client/community/${file}`, import.meta.url), 'utf8');
    assert.equal(packaged, source);
  }
  assert.equal(existsSync(new URL('../dist/client/community/index.html', import.meta.url)), false);
  const packaged = readFileSync(new URL('../public/community/index.html', import.meta.url), 'utf8');
  assert.match(packaged, /href="mailto:Hello@De-Omega-Point\.Com\?subject=Loyalty-4-All%20feedback%20or%20support"/);
  assert.doesNotMatch(packaged, /id="membershipForm"/);
});

test('compiled form renders while unavailable schema and unconfigured owner access fail closed', async () => {
  const app = await worker();
  const env = { ASSETS: noAssets };
  const page = await app.fetch(new Request(`${origin}/register`, { headers: { accept: 'text/html' } }), env, ctx);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /A simple start to local loyalty/);
  assert.match(html, /name="marketingConsent"/);
  assert.doesNotMatch(html, /<input[^>]*checked/);
  assert.match(html, /not verified/);
  for (const path of ['/api/registrations', '/community/', '/community/js/app.js', '/owner/registrations']) {
    const response = await app.fetch(new Request(origin + path), env, ctx);
    assert.equal(response.status, 503, path);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
  }
  for (const path of ['/api/community-members', '/api//community-members', '/api///community-members', '/api/%2fcommunity-members', '/api/community-members.rsc', '/api/community-members.rsc?_rsc=test']) {
    const legacy = await app.fetch(new Request(origin + path, { method: 'POST' }), env, ctx);
    assert.equal(legacy.status, 410, path);
  }
});

test('built Worker performs complete synthetic registration and gates the exact packaged static app', async t => {
  const app = await worker();
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../drizzle/0003_yellow_nightshade.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql) { return { bind(...params) { return {
    async first() { return sqlite.prepare(sql).get(...params) || null; },
    async run() { const result = sqlite.prepare(sql).run(...params); return { success: true, meta: { changes: Number(result.changes) } }; },
  }; } }; } };
  const fetched = [];
  const ASSETS = { async fetch(request) {
    const path = new URL(request.url).pathname;
    fetched.push(path);
    const file = path === '/community/' ? '/community/index.html' : path;
    try { return new Response(readFileSync(new URL(`../dist/client${file}`, import.meta.url)), { headers: { 'Content-Type': 'text/html' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  } };
  const env = { DB, ASSETS };
  const fetch = (path, init = {}) => app.fetch(new Request(origin + path, init), env, ctx);
  assert.equal((await fetch('/community/')).status, 303);
  for (const path of ['/community/js/app.js', '/community/manifest.webmanifest', '/community/service-worker.js', '/%63ommunity/js/app.js']) {
    assert.equal((await fetch(path)).status, 403, path);
  }
  assert.equal(fetched.length, 0);
  const first = await fetch('/api/registrations');
  assert.equal(first.status, 200);
  const cookie = first.headers.get('Set-Cookie').split(';')[0];
  const headers = { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' };
  const saved = await fetch('/api/registrations', { method: 'POST', headers, body: JSON.stringify({ noticeVersion: '2026-10-28-registration-3', kind: 'individual', contactName: 'Synthetic Person', email: 'person@example.test', termsAccepted: true, privacyAcknowledged: true }) });
  assert.equal(saved.status, 201);
  const { productId } = await saved.json();
  assert.match(productId, /^[a-f0-9-]{36}$/);
  for (const file of (await collectPublicAssets(process.cwd())).filter(file => file.protected)) {
    assert.equal(existsSync(new URL(`../dist/client${file.path}`, import.meta.url)), false, file.path);
    const response = await fetch(file.path, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, file.path);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(file.source), file.path);
  }
  for (const path of ['/community/', '/community/index', '/community/js/app.js', '/community/service-worker.js', '/com%6dunity/js/app.js']) {
    const response = await fetch(path, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const file = path === '/community/' || path === '/community/index' ? '/community/index.html' : decodeURIComponent(path);
    assert.equal(await response.text(), readFileSync(new URL(`../public${file}`, import.meta.url), 'utf8'));
  }
  assert.equal(fetched.length, 0, 'Protected app bytes never use the static asset binding');
  const head = await fetch('/community/js/app.js', { method: 'HEAD', headers: { Cookie: cookie } });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.match(head.headers.get('Content-Type'), /^text\/javascript/);
  assert.equal(Number(head.headers.get('Content-Length')), readFileSync('public/community/js/app.js').byteLength);
  const manifest = await fetch('/community/manifest.webmanifest', { headers: { Cookie: cookie } });
  assert.match(manifest.headers.get('Content-Type'), /^application\/manifest\+json/);
  assert.equal((await fetch('/community/', { method: 'POST', headers: { Cookie: cookie } })).status, 405);
  assert.equal((await fetch('/community/missing.js', { headers: { Cookie: cookie } })).status, 404);
  const status = await fetch('/api/registrations', { headers: { Cookie: cookie } });
  assert.equal((await status.json()).productId, productId);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM registered_products').get().n, 1);
  assert.equal(sqlite.prepare('SELECT marketing_consent FROM registered_products').get().marketing_consent, 0);
});

test('built static archive contains no protected app bytes and no proposed production SQL', async () => {
  for (const file of await collectPublicAssets(process.cwd())) {
    assert.equal(existsSync(new URL(`../dist/client${file.path}`, import.meta.url)), !file.protected, file.path);
  }
  const hosting = JSON.parse(readFileSync(new URL('../dist/.openai/hosting.json', import.meta.url), 'utf8'));
  assert.equal(hosting.d1, 'DB');
  assert.equal(existsSync(new URL('../dist/.openai/drizzle/registration-schema.sql', import.meta.url)), false);
});


test('registration consent uses current notices outside the legacy app cache scope', async () => {
  const app = await worker();
  const form = readFileSync(new URL('../app/register/registration-form.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(form, /href="\/community\/(privacy|terms)/);
  for (const slug of ['privacy', 'terms']) {
    const path = `/registration/notices/2026-10-28-registration-3/${slug}.html`;
    assert.ok(form.includes(path));
    const content = readFileSync(new URL(`../dist/client${path}`, import.meta.url), 'utf8');
    const response = await app.fetch(new Request(origin + path), { ASSETS: { fetch: async () => new Response(content) } }, ctx);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(await response.text(), /Version 2026-10-28-registration-3/);
    assert.equal(path.startsWith('/community/'), false);
  }
  assert.match(readFileSync(new URL('../public/community/js/app.js', import.meta.url), 'utf8'), /serviceWorker.register\('\.\/service-worker.js'\)/);
});

test('built installed-context registration alias renders same form in scope and never caches it', async () => {
  const app = await worker();
  const canonical = await app.fetch(new Request(origin + '/community/register/'), {ASSETS:noAssets}, ctx);
  assert.equal(canonical.status,308);
  assert.equal(canonical.headers.get('Location'), '/community/register');
  for (const path of ['/community/register']) {
    const response = await app.fetch(new Request(origin + path, {headers:{accept:'text/html'}}), {ASSETS:noAssets}, ctx);
    assert.equal(response.status,200);
    assert.match(response.headers.get('Cache-Control'),/no-store/);
    const html=await response.text();
    assert.match(html,/registrationContact/);
    assert.match(html,/2026-10-28-registration-3/);
    assert.match(html,/secure cookie/);
    assert.match(html,/digital receipt/);
    assert.match(html,/avoid a duplicate/);
  }
});


test('same-origin welcome alias is public, no-store and contains original logo without asserting registration',async()=>{
 const response=await (await worker()).fetch(new Request(origin+'/community/welcome'),{ASSETS:noAssets},ctx);
 assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);
 const html=await response.text();assert.match(html,/welcome-logo/);assert.match(html,/Checking your digital registration receipt/);
 assert.doesNotMatch(html,/Registration confirmed in this browser/);
 assert.doesNotMatch(html,/href="\/register"/);
 assert.match(html,/href="\/community\/register"/);
});
