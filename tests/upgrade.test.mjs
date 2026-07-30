import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const community = resolve(root, "public/community");

test("includes a persuasive but optional upgrade pathway", () => {
  const index = readFileSync(resolve(community, "index.html"), "utf8");
  const app = readFileSync(resolve(community, "js/app.js"), "utf8");
  const ui = readFileSync(resolve(community, "js/ui.js"), "utf8");
  const worker = readFileSync(resolve(community, "service-worker.js"), "utf8");

  assert.match(index, /When loyalty starts working, make it work harder/);
  assert.match(index, /Community Edition stays free forever/);
  assert.match(index, /Guided Setup/);
  assert.match(index, /Growth Tools/);
  assert.match(index, /Teams & Locations/);
  assert.match(index, /does not start a subscription/i);
  assert.match(index, /data-plan="Starter" data-price="9"/);
  assert.match(index, /data-plan="Pro" data-price="19"/);
  assert.match(index, /data-plan="Business" data-price="39"/);
  assert.match(index, /Mock checkout · No payment taken/);
  assert.match(index, /mockCheckoutDialog/);
  assert.match(ui, /id: 'help', label: 'Help'[\s\S]*id: 'upgrade', label: 'Upgrade'/);
  assert.match(app, /\/api\/upgrade-interest/);
  assert.match(app, /openMockCheckout/);
  assert.match(app, /confirmMockCheckout/);
  assert.match(worker, /loyalty-4-all-community-v5/);
});
