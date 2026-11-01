import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('welcome prominently reuses authentic logo without blocking registration', () => {
  const home = read('app/page.tsx');
  assert.match(home, /className="welcome-logo" src="\/community\/assets\/loyalty-4-all-logo.png"/);
  assert.match(home, /<h2>Loyalty4All<\/h2>/);
  assert.match(home, /className="primary-cta" href="\/community\/register"/);
  assert.match(read('app/register/page.tsx'), /className="registration-welcome-logo"/);
  assert.match(read('app/register/page.tsx'), /<RegistrationForm\s*\/>/);
});
test('logo scales on small screens and entrance is reduced-motion opt-in', () => {
  const css = read('app/globals.css');
  assert.match(css, /width: min\(100%, 280px\)/);
  assert.match(css, /width: min\(100%, 230px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)\s*{\s*\.welcome-logo\s*{ animation: logo-welcome-in/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) { html { scroll-behavior: auto;/);
  assert.doesNotMatch(css, /animation-delay|position: fixed/);
});
