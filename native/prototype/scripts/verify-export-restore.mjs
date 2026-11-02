import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { normaliseBackup } from '../../../public/community/js/data-schema.js';
const outcomes = JSON.parse(readFileSync('evidence/windows-export-runtime.json', 'utf8'));
assert.equal(outcomes.length, 9);
assert.ok(outcomes.every(result => result.passed));
const saved = JSON.parse(readFileSync('evidence/synthetic-saved-json.json', 'utf8'));
// Use the production restore validator against the actual bytes the native flow saved.
// This proves payload restore compatibility, not an interactive full app import.
const restored = normaliseBackup(saved);
assert.equal(restored.customers.length, 1);
assert.equal(restored.customers[0].id, 'synthetic-1');
assert.equal(restored.customers[0].token, 'SYNTHETIC-1');
assert.equal(restored.customers[0].points, 7);
assert.equal(restored.customers[0].visits, 3);
assert.deepEqual(restored.activity, []);
const report = { passed: true, actualNativeSavedBytes: true, productionRestoreValidator: true, interactiveFullAppImport: false, registrationTested: false, offlineTested: false, restoredCustomers: restored.customers.length };
writeFileSync('evidence/windows-export-restore.json', JSON.stringify(report, null, 2));
console.log(report);
