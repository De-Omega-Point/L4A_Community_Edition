import test from 'node:test';
import assert from 'node:assert/strict';
import { checkApp } from '../scripts/check-app.mjs';

function fixture(overrides = {}) {
  const calls = [];
  const form = '<form aria-label="Register for Loyalty-4-All">' + ['kind','contactName','email','termsAccepted','privacyAcknowledged','marketingConsent'].map(name => `<input name="${name}">`).join('') + '</form>';
  const fetcher = async (url, options) => {
    const path = url.pathname;
    calls.push({path, options});
    if (overrides[path]) return overrides[path](options);
    if (path === '/register') return new Response(form);
    if (['/community','/community/','/community/index.html'].includes(path)) return new Response(null, {status:303,headers:{Location:'/register'}});
    if (['/community/manifest.webmanifest','/community/js/app.js','/community/service-worker.js'].includes(path)) return Response.json({code:'registration_required'},{status:403});
    if (path === '/api/registrations') {
      if (options.method === 'POST') return Response.json({code:'invalid_input'},{status:options.headers.Origin === url.origin ? 400 : 403});
      return Response.json({registered:false},{headers:{'Set-Cookie':`__Host-l4a_registration=${'a'.repeat(64)}; Path=/; HttpOnly; Secure; SameSite=Lax`}});
    }
    return new Response('public asset');
  };
  return {fetcher, calls, form};
}

test('release app probe checks registration-first entry without submitting details or consent', async () => {
  const {fetcher, calls} = fixture();
  assert.match(await checkApp(fetcher), /No registration was created/);
  const posts = calls.filter(call => call.options.method === 'POST');
  assert.equal(posts.length, 2);
  for (const call of posts) {
    assert.equal(call.path, '/api/registrations');
    assert.equal(call.options.body, '{}');
    assert.equal(call.options.redirect, 'manual');
    assert(call.options.signal instanceof AbortSignal);
  }
});

test('release app probe rejects an old optional-registration page', async () => {
  await assert.rejects(checkApp(fixture({'/register': () => new Response('<main>Open app without registration</main>')}).fetcher), /Registration form missing/);
});

test('release app probe rejects a bypassed direct app entry', async () => {
  await assert.rejects(checkApp(fixture({'/community/': () => new Response('unguarded app')}).fetcher), /unregistered app navigation must be gated/);
});

test('release app probe rejects mandatory or preselected marketing consent', async () => {
  for (const attribute of ['required', 'checked']) {
    const {form} = fixture();
    await assert.rejects(checkApp(fixture({'/register': () => new Response(form.replace('name="marketingConsent"', `name="marketingConsent" ${attribute}`))}).fetcher), /Marketing must be optional and unchecked/);
  }
});

test('release app probe fails when registration persistence is unavailable', async () => {
  await assert.rejects(checkApp(fixture({'/api/registrations': () => new Response('unavailable',{status:503})}).fetcher), /Registration service\/schema unavailable/);
});


test('public legal assets may follow bounded same-origin normalisation redirects', async () => {
  const {fetcher, calls} = fixture({
    '/community/privacy.html': () => new Response(null, {status:307, headers:{Location:'/community/privacy'}}),
    '/community/terms.html': () => new Response(null, {status:308, headers:{Location:'terms'}}),
    '/community/css/styles.css': () => new Response(null, {status:302, headers:{Location:'https://loyalty-for-all-community.sammielee.chatgpt.site/community/css/current.css'}})
  });
  await checkApp(fetcher);
  for (const path of ['/community/privacy','/community/terms','/community/css/current.css']) assert(calls.some(call => call.path === path), path);
  for (const call of calls) assert.equal(call.options.redirect, 'manual');
});

test('public asset redirects cannot leave the app origin or carry credentials', async () => {
  for (const location of ['https://untrusted.example/privacy', '//untrusted.example/privacy', 'http://loyalty-for-all-community.sammielee.chatgpt.site/privacy', 'https://user:secret@loyalty-for-all-community.sammielee.chatgpt.site/privacy', 'data:text/plain,notice']) {
    const {fetcher, calls} = fixture({'/community/privacy.html': () => new Response(null, {status:307,headers:{Location:location}})});
    await assert.rejects(checkApp(fetcher), /unsafe public redirect target/);
    assert.equal(calls.length, 2, 'Unsafe destination must not be requested.');
  }
});

test('public asset redirects reject missing destinations, loops and excessive hops', async () => {
  await assert.rejects(checkApp(fixture({'/community/privacy.html': () => new Response(null,{status:307})}).fetcher), /public redirect missing Location/);
  await assert.rejects(checkApp(fixture({'/community/privacy.html': () => new Response(null,{status:307,headers:{Location:'/community/privacy.html'}})}).fetcher), /public redirect loop/);
  const overrides = {};
  for (const [from, to] of [['/community/privacy.html','/one'],['/one','/two'],['/two','/three'],['/three','/four']]) overrides[from] = () => new Response(null,{status:307,headers:{Location:to}});
  const {fetcher, calls} = fixture(overrides);
  await assert.rejects(checkApp(fetcher), /too many public redirects/);
  assert(!calls.some(call => call.path === '/four'));
});

test('public redirects do not relax registration or protected app gate expectations', async () => {
  await assert.rejects(checkApp(fixture({'/register': () => new Response(null,{status:307,headers:{Location:'/elsewhere'}})}).fetcher), /HTTP 307/);
  await assert.rejects(checkApp(fixture({'/community/index.html': () => new Response(null,{status:307,headers:{Location:'/community/'}})}).fetcher), /unregistered app navigation must be gated/);
  await assert.rejects(checkApp(fixture({'/community/js/app.js': () => new Response(null,{status:307,headers:{Location:'/register'}})}).fetcher), /unregistered app asset must be gated/);
});
