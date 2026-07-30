import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = resolve(root, 'index.html');
const index = readFileSync(indexPath, 'utf8');

for (const match of index.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
  const reference = match[1];
  if (/^(?:https?:|mailto:|sms:)/.test(reference)) continue;
  assert.ok(existsSync(resolve(root, reference)), `Missing local asset referenced by index.html: ${reference}`);
}

const serviceWorker = readFileSync(resolve(root, 'service-worker.js'), 'utf8');
for (const match of serviceWorker.matchAll(/'\.\/([^']+)'/g)) {
  const reference = match[1];
  if (!reference) continue;
  assert.ok(existsSync(resolve(root, reference)), `Missing service-worker asset: ${reference}`);
}

assert.match(index, /Get Loyalty for All — Free Forever/);
assert.match(index, /registrationForm/);
assert.match(index, /headerProductId/);
assert.doesNotMatch(index, /screen-campaigns/);
assert.doesNotMatch(index, /Stripe|PayPal|AI Assistant/);

const scope = readFileSync(resolve(root, 'COMMUNITY_EDITION_SCOPE.md'), 'utf8');
assert.match(scope, /Free forever/i);
assert.match(scope, /No compulsory subscription/i);

console.log('Static application checks passed.');
