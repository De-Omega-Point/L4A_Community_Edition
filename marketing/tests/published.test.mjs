import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildReleaseManifest, checkPublishedRelease } from '../scripts/check-published.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'l4a-published-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const contents = {
    'index.html': '<h1>Unchanged home page</h1>',
    'pricing.html': '<h1>Community and pilot</h1>',
    'assets/css/styles.css': 'body { color: green; }',
    'assets/js/config.js': 'const paymentsEnabled = false;',
    'assets/images/logo.png': Buffer.from([0, 255, 128, 1])
  };
  for (const [path, body] of Object.entries(contents)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return { root, contents };
}

function fakeSite(contents, override = () => {}) {
  const counts = new Map();
  const calls = [];
  const fetchImpl = async (url, options) => {
    const path = decodeURIComponent(url.pathname.replace('/L4A_Landing/', ''));
    const attempt = (counts.get(path) || 0) + 1;
    counts.set(path, attempt);
    calls.push({ path, url, options });
    return await override({ path, attempt, options }) ?? new Response(contents[path]);
  };
  return { fetchImpl, counts, calls };
}

function verify(root, fetchImpl, options = {}) {
  return checkPublishedRelease({ root, fetchImpl, pollIntervalMs: 1, requestTimeoutMs: 100, timeoutMs: 2000, log() {}, ...options });
}

for (const changed of ['assets/css/styles.css', 'assets/js/config.js', 'assets/images/logo.png', 'pricing.html']) {
  test(`waits for the complete revision when only ${changed} changes`, async t => {
    const { root, contents } = fixture(t);
    const previous = buildReleaseManifest(root);
    const oldContent = contents[changed];
    contents[changed] = Buffer.concat([Buffer.from(oldContent), Buffer.from(' updated')]);
    writeFileSync(join(root, changed), contents[changed]);
    const expected = buildReleaseManifest(root);
    assert.notEqual(expected.revision, previous.revision);
    assert.equal(expected.files.find(file => file.path === 'index.html').sha256,
      previous.files.find(file => file.path === 'index.html').sha256);
    const site = fakeSite(contents, ({ path, attempt }) => {
      if (path === changed && attempt < 3) return new Response(oldContent);
    });
    const result = await verify(root, site.fetchImpl);
    assert.equal(result.attempts, 3);
    assert.equal(result.fileCount, Object.keys(contents).length);
    assert.equal(result.revision, expected.revision);
    for (const count of site.counts.values()) assert.equal(count, 3);
    for (const { url, options } of site.calls) {
      assert.equal(url.searchParams.get('release'), expected.revision);
      assert.equal(options.cache, 'no-store');
    }
  });
}

test('does not combine file matches from different polling attempts', async t => {
  const { root, contents } = fixture(t);
  const site = fakeSite(contents, ({ path, attempt }) => {
    if ((path === 'pricing.html' && attempt === 1) || (path === 'index.html' && attempt === 2)) {
      return new Response('stale file');
    }
  });
  assert.equal((await verify(root, site.fetchImpl)).attempts, 3);
  for (const count of site.counts.values()) assert.equal(count, 3);
});

test('retries transient HTTP failures and rejected network/body requests', async t => {
  const { root, contents } = fixture(t);
  const logs = [];
  const site = fakeSite(contents, ({ path, attempt }) => {
    if (path !== 'assets/js/config.js') return;
    if (attempt === 1) return new Response('not yet deployed', { status: 404 });
    if (attempt === 2) return new Response('unavailable', { status: 503 });
    if (attempt === 3) throw new Error('connection reset');
    if (attempt === 4) return { ok: true, arrayBuffer: async () => { throw new Error('body interrupted'); } };
  });
  assert.equal((await verify(root, site.fetchImpl, { log: message => logs.push(message) })).attempts, 5);
  for (const reason of ['HTTP 404', 'HTTP 503', 'connection reset', 'body interrupted']) {
    assert(logs.some(message => message.includes(`assets/js/config.js: ${reason}`)));
  }
  assert.equal(logs.filter(message => message.startsWith('PUBLIC_OK')).length, Object.keys(contents).length);
});

function untilAborted(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

for (const phase of ['headers', 'body']) {
  test(`aborts delayed ${phase} and retries the whole release`, async t => {
    const { root, contents } = fixture(t);
    let slowSignal;
    const site = fakeSite(contents, ({ path, attempt, options }) => {
      if (path !== 'assets/css/styles.css' || attempt !== 1) return;
      slowSignal = options.signal;
      if (phase === 'headers') return untilAborted(slowSignal);
      return { ok: true, arrayBuffer: () => untilAborted(slowSignal) };
    });
    assert.equal((await verify(root, site.fetchImpl, { requestTimeoutMs: 10 })).attempts, 2);
    assert.equal(slowSignal.aborted, true);
  });
}

test('a persistent mismatch times out with file-level diagnostics and no success output', async t => {
  const { root, contents } = fixture(t);
  const logs = [];
  const site = fakeSite(contents, ({ path }) => {
    if (path === 'assets/css/styles.css') return new Response('old styles');
  });
  await assert.rejects(verify(root, site.fetchImpl, { timeoutMs: 50, log: message => logs.push(message) }),
    /did not become publicly available within 50 ms\.\nassets\/css\/styles.css: deployed file differs/);
  assert(site.counts.get('assets/css/styles.css') > 1);
  assert(!logs.some(message => message.startsWith('PUBLIC_OK') || message.startsWith('Verified')));
});

test('overall deadline caps a request timeout and aborts pending requests', async t => {
  const { root, contents } = fixture(t);
  const signals = [];
  const site = fakeSite(contents, ({ options }) => {
    signals.push(options.signal);
    return untilAborted(options.signal);
  });
  const started = performance.now();
  await assert.rejects(verify(root, site.fetchImpl, { timeoutMs: 30, requestTimeoutMs: 10000 }),
    /did not become publicly available within 30 ms[\s\S]*request timed out/);
  assert(performance.now() - started < 1000, 'must not wait for the ten-second request timeout');
  assert(signals.every(signal => signal.aborted));
});

test('an already published complete revision succeeds without retries', async t => {
  const { root, contents } = fixture(t);
  const site = fakeSite(contents);
  const result = await verify(root, site.fetchImpl);
  assert.equal(result.attempts, 1);
  assert.equal(result.fileCount, 5);
  assert.equal(result.revision, buildReleaseManifest(root).revision);
});

test('manifest revision includes nested file names and ignores non-public documentation', t => {
  const { root } = fixture(t);
  const original = buildReleaseManifest(root);
  writeFileSync(join(root, 'README.md'), 'Documentation-only change');
  assert.deepEqual(buildReleaseManifest(root), original);
  const path = 'assets/images/new logo.png';
  writeFileSync(join(root, path), 'image');
  const added = buildReleaseManifest(root);
  assert.notEqual(added.revision, original.revision);
  assert(added.files.some(file => file.path === path));
  assert.deepEqual(added.files.map(file => file.path), added.files.map(file => file.path).sort());
  rmSync(join(root, path));
  assert.deepEqual(buildReleaseManifest(root), original);
});
