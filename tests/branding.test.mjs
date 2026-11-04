import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const community = resolve(root, "public/community");

test("uses the official Community Edition identity and assets", () => {
  const index = readFileSync(resolve(community, "index.html"), "utf8");
  const styles = readFileSync(resolve(community, "css/styles.css"), "utf8");
  const manifest = readFileSync(resolve(community, "manifest.webmanifest"), "utf8");
  const worker = readFileSync(resolve(community, "service-worker.js"), "utf8");

  assert.match(index, /Loyalty-4-All/);
  assert.match(index, /Community · Free forever/);
  assert.match(index, /Local-first/);
  assert.match(index, /De-Omega-Point Project/);
  assert.match(index, /Powered locally by <strong>Loyalty4All<\/strong>/);
  assert.match(index, /id="settingsBrandLogoFile"/);
  assert.match(index, /The Loyalty-4-All mark stays present/);
  assert.match(styles, /--brand-colour: #07865f/);
  assert.match(manifest, /"short_name": "L4A"/);
  assert.match(worker, /loyalty-4-all-community-/);
  assert.match(worker, /CACHE_PREFIX}v35/);

  for (const asset of [
    "assets/loyalty-4-all-logo.png",
    "assets/icon-192.png",
    "assets/icon-512.png",
    "assets/apple-touch-icon.png",
  ]) {
    assert.equal(existsSync(resolve(community, asset)), true, `${asset} is missing`);
  }
});
