import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Run only after the registration-first app release is deployed. All POSTs
// deliberately omit registration details and consent, so no record is created.
export async function checkApp(fetcher = fetch) {
  const origin = 'https://loyalty-for-all-community.sammielee.chatgpt.site';
  const request = (path, options = {}) => fetcher(new URL(path, origin), {
    signal: AbortSignal.timeout(20000), redirect: 'manual', ...options
  });
  const get = async (path, allowPublicRedirects = false) => {
    let target = new URL(path, origin);
    const visited = new Set([target.href]);
    for (let redirects = 0; ; redirects++) {
      const response = await request(target);
      if (!allowPublicRedirects || ![301, 302, 303, 307, 308].includes(response.status)) {
        assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
        return response.text();
      }
      assert(redirects < 3, `${path}: too many public redirects`);
      const location = response.headers.get('Location');
      assert(location, `${path}: public redirect missing Location`);
      const next = new URL(location, target);
      assert(next.origin === origin && !next.username && !next.password, `${path}: unsafe public redirect target`);
      assert(!visited.has(next.href), `${path}: public redirect loop`);
      visited.add(next.href);
      target = next;
    }
  };
  const registration = await get('/register');
  assert.match(registration, /Register for Loyalty-4-All/, 'Registration form missing.');
  for (const name of ['kind', 'contactName', 'email', 'termsAccepted', 'privacyAcknowledged', 'marketingConsent']) {
    assert(registration.includes(`name="${name}"`), `Registration field missing: ${name}`);
  }
  assert.doesNotMatch(registration, /type="password"/, 'Registration must not request a password.');
  const marketing = registration.match(/<input\b[^>]*name="marketingConsent"[^>]*>/)?.[0];
  assert(marketing, 'Optional marketing control missing.');
  assert.doesNotMatch(marketing, /\b(?:required|checked)(?:\s|=|\/?>)/, 'Marketing must be optional and unchecked.');
  for (const path of ['/community/privacy.html', '/community/terms.html', '/community/css/styles.css', '/community/assets/loyalty-4-all-logo.png']) await get(path, true);

  for (const path of ['/community', '/community/', '/community/index.html']) {
    const response = await request(path);
    assert.equal(response.status, 303, `${path}: unregistered app navigation must be gated.`);
    assert.equal(new URL(response.headers.get('Location'), origin).href, `${origin}/register`, `${path}: registration destination`);
  }
  for (const path of ['/community/manifest.webmanifest', '/community/js/app.js', '/community/service-worker.js']) {
    const response = await request(path);
    assert.equal(response.status, 403, `${path}: unregistered app asset must be gated.`);
    assert.equal((await response.json()).code, 'registration_required', `${path}: gate response`);
  }

  const status = await request('/api/registrations');
  assert.equal(status.status, 200, 'Registration service/schema unavailable.');
  assert.equal((await status.json()).registered, false, 'Anonymous probe must not appear registered.');
  const setCookie = status.headers.get('set-cookie') || '';
  assert.match(setCookie, /^__Host-l4a_registration=[0-9a-f]{64};/u, 'Registration receipt cookie missing.');
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert(setCookie.includes(attribute), `Cookie missing ${attribute}`);
  // Keep the temporary receipt only in memory; never log it or persist it.
  const cookie = setCookie.split(';')[0];
  const invalid = await request('/api/registrations', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie }, body: '{}'
  });
  assert.equal(invalid.status, 400, 'Empty registration must be rejected without creating a record.');
  const forbidden = await request('/api/registrations', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://de-omega-point.github.io', Cookie: cookie }, body: '{}'
  });
  assert.equal(forbidden.status, 403, 'Cross-origin registration must be rejected.');
  return 'Registration entrypoint, legal notices, branding, direct-entry gate and invalid-input safeguards passed. No registration was created.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await checkApp());
  console.log('Valid registration/database insertion, browser rendering and installation were not tested.');
}
