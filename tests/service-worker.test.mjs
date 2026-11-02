import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync('public/community/service-worker.js', 'utf8');
const origin = 'https://example.test';
const base = `${origin}/community/service-worker.js`;
const current = 'loyalty-4-all-community-v32';

function worker({ failInstall = false, networkFails = false } = {}) {
  const listeners = new Map();
  const stores = new Map();
  const added = [], removed = [], fetched = [];
  let claimed = false, skipWaiting = false;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const records = stores.get(name);
      return {
        async addAll(paths) {
          added.push(...paths);
          if (failInstall) throw new Error('Asset unavailable');
          for (const path of paths) records.set(new URL(path, base).href, new Response(`snapshot:${path}`));
        },
        async match(url) { return records.get(String(url)); }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { removed.push(name); return stores.delete(name); }
  };
  vm.runInNewContext(source, {
    self: {
      location: { href: base, origin },
      addEventListener: (type, callback) => listeners.set(type, callback),
      skipWaiting() { skipWaiting = true; },
      clients: { async claim() { claimed = true; } }
    },
    caches, URL, Response, Set,
    fetch: async request => {
      fetched.push(request.url);
      if (networkFails) throw new Error('Offline');
      return new Response('network response');
    }
  });
  async function lifecycle(type) {
    const promises = [];
    listeners.get(type)({ waitUntil: promise => promises.push(promise) });
    await Promise.all(promises);
  }
  async function request(path, options = {}) {
    let response;
    listeners.get('fetch')({
      request: { url: new URL(path, base).href, method: options.method || 'GET', mode: options.mode || 'cors' },
      respondWith: promise => { response = promise; },
      waitUntil: () => { throw new Error('Active snapshots must not be overwritten'); }
    });
    return response === undefined ? null : await response;
  }
  return { async shellStatus() { let message; const promises=[]; listeners.get('message')({data:{type:'L4A_CHECK_SHELL'},ports:[{postMessage:value=>{message=value;}}],waitUntil:promise=>promises.push(promise)}); await Promise.all(promises); return message; }, lifecycle, request, stores, added, removed, fetched, get claimed() { return claimed; }, get skipWaiting() { return skipWaiting; } };
}

test('pre-caches the complete existing app shell and does not interrupt open sessions', async () => {
  const w = worker();
  await w.lifecycle('install');
  assert.equal(w.skipWaiting, false);
  assert(w.added.includes('./js/data-schema.js'));
  for (const path of w.added) {
    assert(existsSync(resolve('public/community', path === './' ? 'index.html' : path)), `${path} missing`);
  }
  const app = readFileSync('public/community/js/app.js', 'utf8');
  for (const [, path] of app.matchAll(/from ['"]\.\/([^'"]+)['"]/g)) {
    assert(w.added.includes(`./js/${path}`), `${path} is not in the offline shell`);
  }
});

test('failed precache does not activate a partial release or remove the prior cache', async () => {
  const w = worker({ failInstall: true });
  w.stores.set('loyalty-4-all-community-v14', new Map());
  await assert.rejects(w.lifecycle('install'), /Asset unavailable/);
  assert.equal(w.skipWaiting, false);
  assert.equal(w.claimed, false);
  assert(w.stores.has('loyalty-4-all-community-v14'));
});

test('activation removes only older Loyalty-4-All caches', async () => {
  const w = worker();
  for (const name of [current, 'loyalty-4-all-community-v14', 'another-app-v1']) w.stores.set(name, new Map());
  await w.lifecycle('activate');
  assert.deepEqual(w.removed, ['loyalty-4-all-community-v14']);
  assert(w.stores.has('another-app-v1'));
  assert(w.stores.has(current));
  assert.equal(w.claimed, true);
});

test('offline HTML and modules use one installed snapshot without background replacement', async () => {
  const w = worker({ networkFails: true });
  await w.lifecycle('install');
  assert.equal(await (await w.request('./', { mode: 'navigate' })).text(), 'snapshot:./');
  assert.equal(await (await w.request('./js/app.js?tracking=ignored')).text(), 'snapshot:./js/app.js');
  assert.equal(await (await w.request('./privacy.html', { mode: 'navigate' })).text(), 'snapshot:./privacy.html');
  assert.equal(w.fetched.length, 0);
});

test('does not intercept API, non-GET, cross-origin or unrelated navigation', async () => {
  const w = worker();
  for (const [path, options] of [
    ['/api/community-members', {}],
    ['./js/app.js', { method: 'POST' }],
    ['https://other.example/community/js/app.js', {}],
    ['/admin', { mode: 'navigate' }],
    ['./not-found.html', { mode: 'navigate' }]
  ]) assert.equal(await w.request(path, options), null, path);
  assert.equal(w.fetched.length, 0);
});

test('never reads another release cache and does not persist a network fallback', async () => {
  const w = worker();
  const url = `${origin}/community/js/app.js`;
  w.stores.set('another-app-v1', new Map([[url, new Response('wrong app')]]));
  w.stores.set('loyalty-4-all-community-v14', new Map([[url, new Response('old release')]]));
  assert.equal(await (await w.request('./js/app.js')).text(), 'network response');
  assert.deepEqual(w.fetched, [url]);
  assert.equal(w.stores.get(current).size, 0);
});

test('an uncached offline request fails honestly instead of returning HTML as JavaScript', async () => {
  const w = worker({ networkFails: true });
  const response = await w.request('./js/app.js');
  assert.equal(response.type, 'error');
});


test('offline readiness confirms complete shell only, never partial files or registration', async () => {
 const w=worker();
 assert.equal((await w.shellStatus()).ready,false);
 await w.lifecycle('install');
 assert.equal((await w.shellStatus()).ready,true);
 w.stores.get(current).delete(new URL('./js/app.js',base).href);
 assert.equal((await w.shellStatus()).ready,false);
 assert.equal(await w.request('/community/register'),null);
 assert.equal(await w.request('/api/registrations'),null);
});
