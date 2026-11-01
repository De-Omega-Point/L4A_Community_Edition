import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';

const publicBase = 'https://de-omega-point.github.io/L4A_Landing/';
const hash = data => createHash('sha256').update(data).digest('hex');

export function buildReleaseManifest(root = '.') {
  function assets(directory) {
    return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return assets(path);
      return entry.isFile() ? [path] : [];
    });
  }
  const pages = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
    .map(entry => entry.name);
  const files = [...pages, ...assets('assets')].sort()
    .map(path => ({ path, sha256: hash(readFileSync(join(root, path))) }));
  assert(pages.includes('index.html'), 'The release must contain index.html.');
  // Asset-only changes need a new cache key even when index.html is unchanged.
  const revision = hash(JSON.stringify(files));
  return { files, revision };
}

async function checkFile(file, base, revision, fetchImpl, timeoutMs) {
  const url = new URL(file.path.split('/').map(encodeURIComponent).join('/'), base);
  url.searchParams.set('release', revision);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) {
      await response.body?.cancel();
      return `${file.path}: HTTP ${response.status}`;
    }
    // Keep the timeout active until the complete body has arrived, not just headers.
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (hash(bytes) !== file.sha256) return `${file.path}: deployed file differs from checked source`;
    return null;
  } catch (error) {
    return `${file.path}: ${controller.signal.aborted ? 'request timed out' : error.message}`;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkPublishedRelease({
  root = '.',
  base = publicBase,
  fetchImpl = fetch,
  timeoutMs = 10 * 60 * 1000,
  requestTimeoutMs = 15000,
  pollIntervalMs = 10000,
  log = console.log
} = {}) {
  for (const [name, value] of Object.entries({ timeoutMs, requestTimeoutMs, pollIntervalMs })) {
    assert(Number.isFinite(value) && value > 0, `${name} must be a positive finite number.`);
  }
  const { files, revision } = buildReleaseManifest(root);
  const deadline = performance.now() + timeoutMs;
  let failures = [];
  let attempt = 0;
  while (performance.now() < deadline) {
    attempt++;
    const budget = Math.min(requestTimeoutMs, Math.max(1, deadline - performance.now()));
    // Recheck every file together. Never combine matches from different deployments.
    failures = (await Promise.all(files.map(file =>
      checkFile(file, base, revision, fetchImpl, budget)
    ))).filter(Boolean);
    if (!failures.length && performance.now() < deadline) {
      for (const file of files) log(`PUBLIC_OK ${file.path}`);
      log(`Verified ${files.length} published pages/assets against source revision ${revision} at ${base}`);
      return { revision, fileCount: files.length, attempts: attempt };
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    log(`Waiting for matching Pages release (attempt ${attempt}, ${failures.length}/${files.length} files pending): ${failures.join('; ')}`);
    await sleep(Math.min(pollIntervalMs, remaining));
  }
  throw new Error(`Matching GitHub Pages release ${revision} did not become publicly available within ${timeoutMs} ms.\n${failures.length ? failures.join('\n') : 'Full verification did not finish before the deadline.'}`);
}

// Importing this module for tests must not contact the public site.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    await checkPublishedRelease();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
