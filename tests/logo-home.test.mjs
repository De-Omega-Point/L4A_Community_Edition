import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mountLogoHome } from '../public/community/js/ui.js';

function fixture({ hidden = false, inert = false } = {}) {
  let click;
  const calls = [];
  const elements = {
    logoHome: { addEventListener(type, handler) { assert.equal(type, 'click'); click = handler; } },
    customerTools: { hidden, inert },
    counterTitle: { focus() { calls.push('focus-counter'); } },
    installFirstTitle: { focus() { calls.push('focus-setup'); } }
  };
  mountLogoHome({ doc: { getElementById: id => elements[id] }, navigate: id => calls.push(id) });
  return { calls, click: (extras = {}) => click({ button: 0, preventDefault() { calls.push('prevent'); }, ...extras }) };
}
test('logo returns to Counter without reload for mouse, touch and keyboard activation', () => {
  for (const detail of [0, 1]) {
    const f = fixture(); f.click({ detail });
    assert.deepEqual(f.calls, ['prevent', 'counter', 'focus-counter']);
    f.click(); assert.deepEqual(f.calls.slice(3), ['prevent', 'counter', 'focus-counter']);
  }
});
test('Home never exposes gated tools', () => {
  for (const state of [{ hidden: true }, { inert: true }, { hidden: true, inert: true }]) {
    const f = fixture(state); f.click();
    assert.deepEqual(f.calls, ['prevent', 'focus-setup']);
  }
});
test('modified clicks keep standard link behaviour', () => {
  for (const extras of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    const f = fixture(); f.click(extras); assert.deepEqual(f.calls, []);
  }
});
test('all primary logos have named home links and visible keyboard focus', () => {
  const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  assert.match(read('public/community/index.html'), /id="logoHome"[^>]+href="\.\/"[^>]+aria-label="Loyalty-4-All home — Counter"/);
  assert.match(read('public/community/js/app.js'), /mountLogoHome\(\)/);
  assert.match(read('public/community/css/styles.css'), /min-height: 44px/);
  assert.match(read('public/community/css/styles.css'), /\.product-lockup:focus-visible/);
  for (const path of ['app/page.tsx', 'app/register/page.tsx']) assert.match(read(path), /className="logo-home-link" href="\/" aria-label="Loyalty4All home"/);
  assert.match(read('app/product-brand.tsx'), /href="\/" aria-label="Loyalty4All home"/);
});
