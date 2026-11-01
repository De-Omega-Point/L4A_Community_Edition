import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const app = 'https://loyalty-for-all-community.sammielee.chatgpt.site/register';
const pages = readdirSync('.').filter(path => path.endsWith('.html'));
const html = page => readFileSync(page, 'utf8');
const anchors = source => [...source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(match => ({
  attributes: match[1],
  href: match[1].match(/\bhref="([^"]*)"/)?.[1],
  text: match[2].replace(/<[^>]*>/g, '').trim()
}));

test('primary start buttons route through registration with consistent copy', () => {
  const context = vm.createContext({window:{}});
  vm.runInContext(readFileSync('assets/js/config.js','utf8'),context);
  assert.equal(context.window.L4A_CONFIG.webAppUrl,app);
  assert.equal(context.window.L4A_CONFIG.paymentsEnabled,false);
  for (const page of ['index.html','pricing.html','download.html','checkout.html','success.html']) {
    const buttons = anchors(html(page)).filter(link => /\bdata-start-app\b/.test(link.attributes));
    assert(buttons.length > 0, `${page}: missing registration-first start button`);
    for (const button of buttons) {
      assert.equal(button.text,'Start using Loyalty4All',page);
      assert.equal(button.href,app,page);
    }
  }
});

test('the home journey explains registration before installation and use', () => {
  const home = html('index.html');
  const hero = home.match(/<div class="hero-actions">([\s\S]*?)<\/div>/)[1];
  const links = anchors(hero);
  assert.equal(links[0].text,'Start using Loyalty4All');
  assert.equal(links[0].href,app);
  assert.equal(links[1].text,'See how it works');
  assert.equal(links[1].href,'#how');
  const how = home.match(/<section[^>]*id="how"[^>]*>([\s\S]*?)<\/section>/)[1];
  for (const step of ['Register free','Install or open the app','Use it with customers']) assert(how.includes(step));
  assert.doesNotMatch(how,/checkout\.html|Join free|register interest/i);
  assert(home.indexOf('After you’ve used it') > home.lastIndexOf('data-start-app'));
  assert.match(home,/optional and does not sign you up for updates/);
});

test('navigation preserves product discovery without pilot promotion', () => {
  for (const page of pages) {
    const source = html(page);
    const nav = source.match(/<nav class="nav-links"[^>]*>([\s\S]*?)<\/nav>/)[1];
    assert.deepEqual(anchors(nav).map(link => link.href),['index.html','index.html#how','pricing.html','download.html'],page);
    assert.doesNotMatch(source,/pilot|Register interest|Prepare a request/i,page);
    assert.match(source,/assets\/images\/loyalty-4-all-logo\.png/,page);
    assert.match(source,/Online payments unavailable/,page);
    assert.match(source,/connect-src 'none'/,page);
    assert.match(source,/form-action 'none'/,page);
  }
});

test('legacy checkout remains usable feedback without registration or automatic transmission', () => {
  const source = html('checkout.html');
  assert.match(source,/<form[^>]*data-feedback-form/);
  assert.match(source,/<textarea[^>]*name="message"[^>]*maxlength="2000"[^>]*required/);
  for (const name of ['businessName','email','contactName']) {
    const control = source.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))[0];
    assert.doesNotMatch(control,/\brequired\b/);
  }
  assert.match(source,/<input[^>]*name="privacyAccepted"[^>]*required/);
  assert.doesNotMatch(source,/data-registration|name="updatesConsent"|membershipForm/);
  assert.match(source,/<noscript>[\s\S]*Email support directly[\s\S]*mailto:hello@de-omega-point.com/);
  assert.match(source,/There is no checkout here/);
  assert.match(source,/De-Omega-Point has not received this message/);
  assert.match(source,/does not send email, create an account or subscribe you to updates/);
});

test('local-first limitations and optional updates stay explicit and separate', () => {
  const community = html('pricing.html');
  for (const text of ['Free to use','Export regular backups','not automatically uploaded','synchronised across devices','Google Play, App Store, APK and ZIP']) {
    assert(community.includes(text),text);
  }
  assert.match(community,/Optional updates, separately/);
  assert.match(community,/optional and is not needed to use the loyalty tools/);
  const privacy = html('privacy.html');
  assert.match(privacy,/Your business name, preferred reply email and name are optional/);
  assert.match(privacy,/does not register you for the app or subscribe you to updates/);
  assert.match(privacy,/This product website does not collect registrations/);
  assert.match(privacy,/Registration is required on the app’s website before installation or use/);
  assert.match(privacy,/registration contact details privately in its central database/);
  assert.match(privacy,/App registration does not include local customer records/);
  assert.match(privacy,/not a password, verified identity or proof of paid access/);
  assert.match(privacy,/local workspace ID is a separate on-device reference/);
  assert.match(privacy,/18 October 2026/);
  assert.match(html('download.html'),/does not guarantee offline operation/);
});


test('public pages do not retain bypass links or no-registration promises', () => {
  for (const page of pages) {
    const source = html(page);
    const appLinks = anchors(source).filter(link => link.href?.startsWith('https://loyalty-for-all-community.sammielee.chatgpt.site'));
    for (const link of appLinks) assert([app, `${app.replace('/register','')}/community/privacy.html`, `${app.replace('/register','')}/community/terms.html`].includes(link.href), `${page}: unexpected app entrypoint`);
    assert.doesNotMatch(source, /no account or registration|without an account|without registration|no compulsory registration|does not require registration|no account is required|registration remains separate in the app’s Insights/i, page);
  }
  for (const page of ['index.html','pricing.html','download.html']) {
    assert.match(html(page), /[Rr]egister/);
    assert.match(html(page), /[Nn]o password|does not ask for a password/);
    assert.match(html(page), /[Mm]arketing.{0,40}optional/);
  }
});

test('installation guide distinguishes registration, optional browser install and paused native downloads', () => {
  const source = html('download.html');
  assert.match(source, /Complete registration and open the app first/);
  assert.match(source, /Installation is optional/);
  assert.match(source, /Google Play, App Store, APK and ZIP downloads remain paused/);
  assert.match(source, /not a native app-store download/);
  assert.match(source, /Product ID after registration/);
  assert.match(source, /local workspace ID is a separate on-device reference/);
});
