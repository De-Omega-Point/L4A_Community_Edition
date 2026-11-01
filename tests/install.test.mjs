import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { requiresRegistration } from "../server/registration/gate.mjs";

const root = process.cwd();
const html = readFileSync(resolve(root, "public/community/index.html"), "utf8");
const app = readFileSync(resolve(root, "public/community/js/app.js"), "utf8");
const landing = readFileSync(resolve(root, "app/page.tsx"), "utf8");
const state = readFileSync(resolve(root, "public/community/js/state.js"), "utf8");
const storage = readFileSync(resolve(root, "public/community/js/storage.js"), "utf8");

test("product website sends visitors to required registration before free installation", () => {
  assert.match(landing, /Start using Loyalty4All/);
  assert.match(landing, /Install directly from the web/);
  assert.match(landing, /href="\/community\/register"/);
});

test("business records use durable on-device storage with a compatibility mirror", () => {
  assert.match(storage, /indexedDB\.open/);
  assert.match(state, /await commitWorkspace/);
  assert.match(storage, /transaction\(STORE_NAME, 'readwrite'\)/);
  assert.match(storage, /expectedRevision/);
  assert.match(storage, /transaction.oncomplete/);
  assert.match(state, /'business-data'/);
  assert.match(state, /normaliseSnapshot/);
  assert.match(state, /localStorage\.setItem/);
});

test("community app provides native and manual PWA install paths", () => {
  assert.match(html, /id="installBanner"/);
  assert.match(html, /id="installDialog"/);
  assert.match(readFileSync(resolve(root, "public/community/js/install-controller.js"), "utf8"), /beforeinstallprompt/);
  assert.match(readFileSync(resolve(root, "public/community/js/install-guidance.js"), "utf8"), /Add to Home Screen/);
  assert.match(app, /createInstallController/);
});


test("registration-protected manifest includes credentials without weakening the gate", () => {
  assert.equal(requiresRegistration('/community/manifest.webmanifest'), true);
  assert.match(html, /<link\s+rel="manifest"\s+href="manifest.webmanifest"\s+crossorigin="use-credentials"\s*\/>/);
  const manifest = JSON.parse(readFileSync(resolve(root, "public/community/manifest.webmanifest"), "utf8"));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  for (const size of ['192x192', '512x512']) assert.ok(manifest.icons.some(icon => icon.sizes === size && icon.type === 'image/png'));
});
