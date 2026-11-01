import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { csvCell } from "../public/community/js/utils.js";

const html = fs.readFileSync("public/community/index.html", "utf8");
const app = fs.readFileSync("public/community/js/app.js", "utf8");
const state = fs.readFileSync("public/community/js/state.js", "utf8");

test("opens directly on the core visit workflow", () => {
  assert.doesNotMatch(html, /registrationGate/);
  assert.match(html, /Customer visit/);
  assert.match(html, /Scan customer QR/);
  assert.match(html, /Record Visit/);
  assert.match(html, /Give Reward/);
});

test("registered Community Edition keeps marketing optional and customer work local", () => {
  assert.doesNotMatch(app, /\/api\/register/);
  assert.doesNotMatch(app, /upgrade-interest/);
  assert.match(state, /storageModel: 'local-first'/);
  assert.match(state, /LFA-LOCAL-/);
  assert.match(html, /No Loyalty-4-All account, credit card or compulsory subscription/);
  assert.match(html, /preference was recorded during registration/);
  assert.match(html, /Customer records, private notes and backups are not sent with registration/);
});

test("local backup and CSV export remain owner controlled", () => {
  assert.match(html, /Download Backup/);
  assert.match(html, /Restore Backup/);
  assert.match(html, /Export Customer CSV/);
  assert.match(app, /markBackupCreated/);
  assert.match(app, /row\.map\(csvCell\)/);
  assert.equal(csvCell(' =SUM(A1:A2)'), '"\' =SUM(A1:A2)"');
});

test("feedback stays optional and secondary at the end of Settings", () => {
  const settings = html.match(/<section id="screen-settings" class="screen">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(settings, "Settings remains separate from the active customer workflow");
  const feedback = settings.match(/<p id="appFeedback" class="tiny muted spaced">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(feedback, "Feedback uses the existing small, muted text styling");
  assert.equal((html.match(/id="appFeedback"/g) || []).length, 1);
  assert.ok(settings.indexOf('id="appFeedback"') > settings.indexOf('id="btnImportData"'));
  assert.ok(settings.indexOf('id="appFeedback"') > settings.indexOf('id="btnSettingsJoin"'));
  assert.match(feedback, /Tried the app\?/);
  assert.match(feedback, /Share feedback or ask for help/);
  assert.match(feedback, /\(optional\)/);
  assert.match(feedback, /Opens your email app without adding customer details or backups/);
  assert.doesNotMatch(feedback, /<(?:button|form|dialog|input)\b/);
});

test("feedback email is a plain, user-initiated link with only a fixed subject", () => {
  const feedback = html.match(/<p id="appFeedback"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  assert.ok(feedback);
  const links = [...feedback.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 1);
  const [, attributes, label] = links[0];
  // No inline handlers, tracking attributes, scripts, body or attachments.
  const href = attributes.match(/^ href="([^"]+)"$/)?.[1];
  assert.ok(href, "The email link has only a static href");
  assert.equal(label, "Share feedback or ask for help");
  const email = new URL(href);
  assert.equal(email.protocol, "mailto:");
  assert.equal(email.pathname, "Hello@De-Omega-Point.Com");
  assert.deepEqual([...email.searchParams], [["subject", "Loyalty-4-All feedback or support"]]);
  assert.equal(email.hash, "");
  const modules = fs.readdirSync("public/community/js")
    .filter(name => name.endsWith(".js"))
    .map(name => fs.readFileSync(`public/community/js/${name}`, "utf8"))
    .join("\n");
  assert.doesNotMatch(modules, /appFeedback|Hello@De-Omega-Point\.Com/,
    "No application module targets the feedback element or support destination");
});
