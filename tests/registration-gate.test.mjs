import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as gate from '../server/registration/gate.mjs';
import * as productBrand from '../server/product-brand.mjs';
import { registrationNotificationHook } from '../server/registration/email-notifications.mjs';
import { ownerRegistrations } from '../server/registration/owner.mjs';
import { protectedCommunityResponse } from '../server/community-assets.mjs';

const url = 'https://example.test';
function worker(access = null) {
  let downstream = 0, accessCalls = 0, assetFetches = 0;
  const compiled = ts.transpileModule(readFileSync('worker/index.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, URL, Request, Response, Headers,
    require(name) {
      if (name === 'vinext/server/app-router-entry') return { default: { async fetch(request) { downstream++; return new Response(new URL(request.url).pathname, { headers: { 'Cache-Control': 'public,max-age=3600' } }); } } };
      if (name === 'vinext/server/image-optimization') return { DEFAULT_DEVICE_SIZES: [], DEFAULT_IMAGE_SIZES: [], handleImageOptimization: async (request, options) => options.fetchAsset(new URL(request.url).searchParams.get('url')) };
      if (name === '../db') return { setDbEnv() {} };
      if (name === 'virtual:protected-community-assets') return { default: { '/community/js/app.js': Buffer.from('protected app module').toString('base64') } };
      if (name.endsWith('community-assets.mjs')) return { protectedCommunityResponse };
      if (name.endsWith('gate.mjs')) return gate;
      if (name.endsWith('product-brand.mjs')) return productBrand;
      if (name.endsWith('email-notifications.mjs')) return { registrationNotificationHook };
      if (name.endsWith('owner.mjs')) return { ownerRegistrations };
      if (name.endsWith('provider.mjs')) return { handleRegistrationRequest: async () => new Response('registration API'), registrationAccess: async () => { accessCalls++; if (access instanceof Error) throw access; return access; } };
      throw new Error(name);
    }
  });
  const env = { ASSETS: { fetch: async () => { assetFetches++; return new Response('asset'); } } };
  return { fetch: path => exports.default.fetch(new Request(url + path), env, {}), get downstream() { return downstream; }, get accessCalls() { return accessCalls; }, get assetFetches() { return assetFetches; } };
}

test('unregistered direct entry, encoded aliases, modules and manifest never reach static delivery', async () => {
  for (const path of ['/community','/community/','/community/index.html','/community/js/app.js','/community/manifest.webmanifest','/community/service-worker.js','/com%6dunity/js/app.js','/community%252fjs%252fapp.js']) {
    const app = worker(); const response = await app.fetch(path);
    assert.ok([303,403].includes(response.status), path); assert.equal(app.downstream, 0); assert.equal(app.assetFetches, 0); assert.equal(app.accessCalls, 1);
  }
});

test('registered assets are served privately; D1 failure stays closed', async () => {
  const app = worker({ id: 'synthetic' }); const response = await app.fetch('/community/js/app.js');
  assert.equal(response.status, 200); assert.equal(app.assetFetches, 0); assert.equal(app.downstream, 0); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(await response.text(), 'protected app module');
  const failed = worker(new Error('database unavailable')); assert.equal((await failed.fetch('/community/')).status, 503); assert.equal(failed.downstream, 0);
});

test('registration page, legal notice and branding remain public; optimizer cannot bypass gate', async () => {
  for (const path of ['/register','/community/privacy.html','/community/terms.html','/community/assets/loyalty-4-all-logo.png']) {
    const app = worker(); assert.equal((await app.fetch(path)).status, 200); assert.equal(app.accessCalls, 0);
  }
  const app = worker(); assert.equal((await app.fetch('/_vinext/image?url=/community/js/app.js')).status, 403); assert.equal(app.assetFetches, 0);
  for (const path of ['/community/%ZZ','/community/%5cjs/app.js','/%252525252fcommunity']) assert.equal((await app.fetch(path)).status, 400);
});

test('owner list fails closed before querying D1 unless trusted owner setup is explicitly confirmed', async () => {
  const db = { prepare() { throw new Error('private query must not run'); } };
  for (const env of [{ DB: db }, { DB: db, REGISTRATION_OWNER_SITE_USER_ID: 'owner' }, { DB: db, REGISTRATION_OWNER_ACCESS_READY: 'confirmed' }]) {
    const response = await ownerRegistrations(new Request(url + '/owner/registrations', { headers: { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.test' } }), env);
    assert.equal(response.status, 503); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
});

test('configured owner list denies anonymous, nonowner, email-only, query and public-ID claims', async () => {
  const env = { REGISTRATION_OWNER_ACCESS_READY: 'confirmed', REGISTRATION_OWNER_SITE_USER_ID: 'owner', DB: { prepare() { throw new Error('must not query'); } } };
  for (const headers of [{}, {'oai-authenticated-user-email':'owner@example.test'}, {'oai-authenticated-user-id':'other'}, {'cookie':'productId=owner'}]) {
    const response = await ownerRegistrations(new Request(url + '/owner/registrations?owner=owner', { headers }), env);
    assert.ok([401,403].includes(response.status));
  }
});

test('synthetic trusted-owner request sees bounded escaped projection, never receipts', async () => {
  let query = '', offset;
  const rows = [{ id: 'synthetic-id', kind: 'individual', contact_name: '<script>alert(1)</script>', email: 'owner@example.test', marketing_consent: 0, receipt_hash: 'must-not-leak' }];
  const env = { REGISTRATION_OWNER_ACCESS_READY: 'confirmed', REGISTRATION_OWNER_SITE_USER_ID: 'owner', DB: { prepare(sql) { query = sql; return { bind(value) { offset = value; return { all: async () => ({ success: true, results: rows }) }; } }; } } };
  const request = new Request(url + '/owner/registrations', { headers: { 'oai-authenticated-user-id': 'owner' } });
  const response = await ownerRegistrations(request, env); const html = await response.text();
  assert.equal(response.status, 200); assert.equal(offset, 0); assert.match(query, /LIMIT 51 OFFSET \?/); assert.doesNotMatch(query, /receipt_hash|SELECT \*/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|must-not-leak/); assert.match(html, /Not opted in/); assert.match(html, /not verified download counts/);
});

test('build configuration bundles protected assets independently of static Worker-first support', () => {
  assert.match(readFileSync('vite.config.ts', 'utf8'), /protectedCommunityAssets\(\)/);
  assert.match(readFileSync('worker/index.ts', 'utf8'), /virtual:protected-community-assets/);
});


test('owner query failures and malformed results never look like an empty list', async () => {
  for (const result of [{ success: false }, { success: false, results: [] }, { success: true }, { success: true, results: {} }]) {
    const env = { REGISTRATION_OWNER_ACCESS_READY: 'confirmed', REGISTRATION_OWNER_SITE_USER_ID: 'owner', DB: { prepare() { return { bind() { return { all: async () => result }; } }; } } };
    const response = await ownerRegistrations(new Request(url + '/owner/registrations', { headers: { 'oai-authenticated-user-id': 'owner' } }), env);
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /No registrations on this page/);
  }
});


test('in-scope registration reuses framework UI without a receipt or static assets, always uncached', async () => {
  for (const path of ['/register', '/register/', '/community/register', '/community/register/', '/community/%72egister']) {
    const app = worker(); const response = await app.fetch(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(app.downstream, 1); assert.equal(app.accessCalls, 0); assert.equal(app.assetFetches, 0);
  }
  const alias = readFileSync('app/community/register/page.tsx', 'utf8');
  assert.match(alias, /import RegistrationPage from '\.\.\/\.\.\/register\/page'/);
  assert.match(alias, /<RegistrationPage \/>/);
  assert.match(alias, /export \{ dynamic \} from '\.\.\/\.\.\/register\/page'/);
});

test('missing receipt navigations stay in installed scope but non-navigation protected resources remain denied', async () => {
  for (const path of ['/community', '/community/', '/community/index.html']) {
    const response = await worker().fetch(path);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Location'), '/community/register');
  }
  const response = gate.registrationRequiredResponse(new Request(url + '/community/settings', { headers: { 'sec-fetch-mode': 'navigate' } }), '/community/settings');
  assert.equal(response.headers.get('Location'), '/community/register');
  for (const path of ['/community/register/extra', '/community/register.js', '/community/manifest.webmanifest', '/community/js/app.js']) {
    assert.equal(gate.requiresRegistration(path), true, path);
    assert.equal((await worker().fetch(path)).status, 403);
  }
});
