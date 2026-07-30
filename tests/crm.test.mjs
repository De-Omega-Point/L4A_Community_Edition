import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const community = resolve(root, "public/community");
const { crmStatus } = await import("../public/community/js/crm.js");
const { appState } = await import("../public/community/js/state.js");

test("includes the automatic CRM workspace", () => {
  const index = readFileSync(resolve(community, "index.html"), "utf8");
  const crm = readFileSync(resolve(community, "js/crm.js"), "utf8");
  const ui = readFileSync(resolve(community, "js/ui.js"), "utf8");

  assert.match(index, /Customer CRM/);
  assert.match(index, /crmSegmentFilter/);
  assert.match(index, /crmFollowUp/);
  assert.match(index, /crmProfile/);
  assert.match(crm, /export function crmStatus/);
  assert.match(crm, /No contact permission/);
  assert.match(ui, /label: 'CRM'/);
});

test("CRM status is derived without extra customer inputs", () => {
  const customer = { id: "customer-1", visits: 1 };

  appState.activity = [{
    customerId: customer.id,
    type: "visit",
    at: new Date().toISOString(),
  }];
  assert.deepEqual(crmStatus(customer), { key: "active", label: "Active" });

  appState.activity = [{
    customerId: customer.id,
    type: "visit",
    at: new Date(Date.now() - 46 * 86400000).toISOString(),
  }];
  assert.deepEqual(crmStatus(customer), { key: "follow-up", label: "Follow-up" });

  assert.deepEqual(crmStatus({ id: "new", visits: 0 }), { key: "new", label: "New" });
});
