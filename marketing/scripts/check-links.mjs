import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
const pages = readdirSync('.').filter(path => path.endsWith('.html'));
const referencePattern = /(?:href|src)="([^"]+)"/g;
let references = 0;
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  assert.match(html, /<html lang="en-AU">/, page + ': Australian English');
  assert.match(html, /<meta name="viewport"/, page + ': viewport');
  assert.match(html, /<main id="main">/, page + ': main landmark');
  assert.match(html, /aria-label="Main navigation"/, page + ': navigation');
  assert.match(html, /connect-src 'none'/, page + ': no background transmissions');
  assert.doesNotMatch(html, /data-demo-pay|paypal.com\/sdk|data-selected-price|data-download-button/, page + ': retired checkout');
  for (const match of html.matchAll(referencePattern)) {
    const target = match[1];
    if (/^(https:|mailto:)/.test(target)) continue;
    assert(!/^[a-z]+:/i.test(target), page + ': unexpected link scheme');
    const [rawPath, fragment] = target.split('#');
    const path = rawPath.split('?')[0] || page;
    const absolute = resolve(dirname(page), path);
    assert(existsSync(absolute), `${page} references missing local file: ${target}`);
    if (fragment && path.endsWith('.html')) {
      assert(readFileSync(absolute, 'utf8').includes(`id="${fragment}"`), `${page}: missing anchor ${target}`);
    }
    references++;
  }
}
for (const file of readdirSync('assets/js')) {
  const source = readFileSync('assets/js/' + file, 'utf8');
  assert.doesNotMatch(source, /confirmPaymentWithBackend|saveOrder|seedDemoOrders|generateSerialNumber|paypal\.Buttons|innerHTML|insertAdjacentHTML/, file + ': unsafe legacy code');
  assert.doesNotMatch(source, /localStorage\.setItem|sessionStorage|fetch\s*\(/, file + ': no personal-data persistence or background requests');
}
console.log(`Checked ${pages.length} pages and ${references} local references; local-first storefront safeguards passed.`);
