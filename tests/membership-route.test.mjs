import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync('app/api/community-members/route.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, Response, require() { throw new Error('Retired route must have no database dependency'); } });

test('legacy membership endpoint cannot create records or change existing consent', async () => {
  for (const body of [{ productId: 'LFA-LOCAL-23456789', email: 'changed@example.test', updatesConsent: true }, { website: 'honeypot' }, null]) {
    const response = await exports.POST(new Request('https://example.test/api/community-members', { method: 'POST', body: JSON.stringify(body) }));
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match((await response.json()).error, /Existing membership records are unchanged/);
  }
  assert.doesNotMatch(source, /getDb|\.insert\(|\.update\(|\.delete\(/);
});
