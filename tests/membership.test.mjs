import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const community = resolve(root, "public/community");

test("retains Community Intelligence resources without a second registration form", () => {
  const html = readFileSync(resolve(community, "index.html"), "utf8");
  const ui = readFileSync(resolve(community, "js/ui.js"), "utf8");
  const app = readFileSync(resolve(community, "js/app.js"), "utf8");

  assert.match(html, /Loyalty-4-All Community Intelligence/);
  assert.match(html, /Real-Time AI Marketing Pulse/);
  assert.match(html, /Social Media Signals/);
  assert.match(html, /Industry &amp; Local Trends/);
  assert.doesNotMatch(html, /id="membership(?:Form|FormPanel|BusinessName|ContactName|Email|UpdatesConsent|Success)"/);
  assert.doesNotMatch(app, /bindMembership|from ['"]\.\/membership\.js['"]/);
  assert.match(html, /preference was recorded during registration/);
  assert.match(html, /There is no second form to complete/);
  assert.match(html, /mailto:Hello@De-Omega-Point\.Com\?subject=Loyalty-4-All%20email%20preference/);
  assert.match(html, /Local workspace ID/);
  assert.match(html, /No credit card/);
  assert.match(html, /Optional email updates/);
  assert.match(ui, /\{ id: 'intelligence', label: 'Insights' \}/);
});

test("legacy membership module and database records are retained while its write route is retired", () => {
  const membership = readFileSync(resolve(community, "js/membership.js"), "utf8");
  const route = readFileSync(resolve(root, "app/api/community-members/route.ts"), "utf8");
  const schema = readFileSync(resolve(root, "db/schema.ts"), "utf8");

  assert.match(membership, /\/api\/community-members/);
  assert.match(membership, /updatesConsent/);
  assert.match(membership, /termsConsent/);
  assert.doesNotMatch(membership, /appState\.customers/);
  assert.match(route, /status: 410/);
  assert.doesNotMatch(route, /getDb|\.insert\(|\.update\(/);
  assert.match(schema, /updatesConsent/);
  assert.match(schema, /intelligenceInterests/);
});

test("offline shell preserves the legacy membership module without exposing its form", () => {
  const worker = readFileSync(resolve(community, "service-worker.js"), "utf8");
  assert.match(worker, /loyalty-4-all-community-/);
  assert.match(worker, /CACHE_PREFIX}v34/);
  assert.match(worker, /\.\/js\/membership\.js/);
});
