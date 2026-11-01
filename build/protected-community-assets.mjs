import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { requiresRegistration } from '../server/registration/gate.mjs';

export const VIRTUAL_ASSETS_ID = 'virtual:protected-community-assets';
const RESOLVED_ASSETS_ID = '\0' + VIRTUAL_ASSETS_ID;

// One policy decides both which bytes may reach the public asset store and
// which bytes must be served by the Worker after its receipt check.
export async function collectPublicAssets(root) {
  const files = [];
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const source = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Public asset symlinks are not supported: ${relative}`);
      if (entry.isDirectory()) await walk(source, relative + '/');
      else if (entry.isFile()) files.push({ path: '/' + relative, source, protected: requiresRegistration('/' + relative) });
    }
  }
  await walk(resolve(root, 'public'));
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** @returns {import('vite').Plugin} */
export function protectedCommunityAssets() {
  let root;
  let publicDirectory;
  async function stagePublicAssets() {
    const files = await collectPublicAssets(root);
    await rm(publicDirectory, { recursive: true, force: true });
    await mkdir(publicDirectory, { recursive: true });
    for (const file of files.filter(file => !file.protected)) {
      const destination = join(publicDirectory, file.path.slice(1));
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, await readFile(file.source));
    }
  }
  return {
    name: 'protected-community-assets',
    enforce: 'pre',
    async config(config) {
      root = resolve(config.root || process.cwd());
      publicDirectory = resolve(root, '.sites-runtime/public');
      await stagePublicAssets();
      return { publicDir: publicDirectory };
    },
    resolveId(id) { if (id === VIRTUAL_ASSETS_ID) return RESOLVED_ASSETS_ID; },
    async load(id) {
      if (id !== RESOLVED_ASSETS_ID) return;
      const assets = {};
      for (const file of await collectPublicAssets(root)) {
        this.addWatchFile(file.source);
        if (file.protected) assets[file.path] = (await readFile(file.source)).toString('base64');
      }
      return `export default ${JSON.stringify(assets)};`;
    },
  };
}
