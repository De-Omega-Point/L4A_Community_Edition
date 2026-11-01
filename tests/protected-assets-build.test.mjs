import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { protectedCommunityAssets, VIRTUAL_ASSETS_ID } from '../build/protected-community-assets.mjs';

test('build staging excludes all protected files, including new unknown paths and stale copies', async t => {
  const root = await mkdtemp(join(tmpdir(), 'l4a-private-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'public/community/new'), { recursive: true });
  await writeFile(join(root, 'public/community/index.html'), '<h1>private shell</h1>');
  await writeFile(join(root, 'public/community/new/future.bin'), Uint8Array.from([0, 128, 255]));
  await writeFile(join(root, 'public/community/privacy.html'), '<h1>public legal</h1>');
  await mkdir(join(root, '.sites-runtime/public/community/new'), { recursive: true });
  await writeFile(join(root, '.sites-runtime/public/community/new/old.js'), 'stale leak');
  const plugin = protectedCommunityAssets();
  const config = await plugin.config({ root });
  assert.equal(await readFile(join(config.publicDir, 'community/privacy.html'), 'utf8'), '<h1>public legal</h1>');
  for (const file of ['index.html', 'new/future.bin', 'new/old.js']) {
    assert.equal(existsSync(join(config.publicDir, 'community', file)), false, file);
  }
  const watched = [];
  const source = await plugin.load.call({ addWatchFile(path) { watched.push(path); } }, plugin.resolveId(VIRTUAL_ASSETS_ID));
  const assets = JSON.parse(source.slice('export default '.length, -1));
  assert.equal(Buffer.from(assets['/community/index.html'], 'base64').toString(), '<h1>private shell</h1>');
  assert.deepEqual(Buffer.from(assets['/community/new/future.bin'], 'base64'), Buffer.from([0, 128, 255]));
  assert.equal(Object.hasOwn(assets, '/community/privacy.html'), false);
  assert.equal(watched.length, 3);
});
