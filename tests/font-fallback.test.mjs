import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('public pages use resilient system fonts without build-machine font URLs', () => {
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.doesNotMatch(layout, /next\/font|Geist/);
  assert.match(css, /font-family: system-ui,/);
  assert.match(css, /font-family: ui-monospace,/);
  assert.doesNotMatch(css, /var\(--font-geist/);
});
