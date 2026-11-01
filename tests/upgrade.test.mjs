import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const community = resolve(root, "public/community");

test("camera scanning has a QR fallback and clean shutdown", () => {
  const scanner = readFileSync(resolve(community, "js/scanner.js"), "utf8");
  assert.match(scanner, /BarcodeDetector\.getSupportedFormats/);
  assert.match(scanner, /window\.jsQR/);
  assert.match(scanner, /inversionAttempts: 'attemptBoth'/);
  assert.match(scanner, /getTracks\(\)\.forEach/);
});

test("surprise rewards are optional, local and limited to one draw per day", () => {
  const html = readFileSync(resolve(community, "index.html"), "utf8");
  const rewards = readFileSync(resolve(community, "js/rewards.js"), "utf8");
  assert.match(html, /Enable surprise rewards/);
  assert.match(html, /Off by default/);
  assert.match(rewards, /lastSurpriseRollDate/);
  assert.match(rewards, /crypto\.getRandomValues/);
  assert.match(rewards, /surprise_reward/);
});

test("the Community app does not contain a mock paid checkout", () => {
  const html = readFileSync(resolve(community, "index.html"), "utf8");
  assert.doesNotMatch(html, /Mock checkout/i);
  assert.doesNotMatch(html, /Choose Pro/);
  assert.doesNotMatch(html, /A\$19\/month/);
});
