import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const coreSource = readFileSync('assets/js/core.js', 'utf8');
const configSource = readFileSync('assets/js/config.js', 'utf8');
const checkoutSource = readFileSync('assets/js/checkout.js', 'utf8');
function core() {
  const context = vm.createContext({});
  vm.runInContext(coreSource, context);
  return context.L4A;
}
const valid = {businessName:'Example Test Café', email:'OWNER@example.test', contactName:'Test Merchant', message:'Recording visits was useful. How can I explain rewards to customers?', privacyAccepted:true};
test('feedback normalises email without requesting registration or updates', () => {
  const api = core();
  const data = api.normaliseRequest(valid);
  assert.equal(data.email, 'owner@example.test');
  assert.equal(api.validateRequest(data), '');
  const text = api.buildRequestText(data, '2026-10-17');
  assert.match(text, /does not subscribe me to updates/);
  assert.match(text, /Recording visits was useful/);
  assert.match(text, /not a purchase/);
  assert.equal('updatesConsent' in api.normaliseRequest({...valid,updatesConsent:true}), false);
  assert.doesNotMatch(text, /pilot|register interest|opt in/);
});
test('empty, invalid, oversized and unacknowledged requests do not proceed', () => {
  const api = core();
  for (const change of [{message:'  '},{message:'x'.repeat(2001)},{email:'wrong'},{email:'a@b'},{email:'a\n@b.test'},{email:'x'.repeat(245)+'@example.test'},{businessName:'x'.repeat(121)},{contactName:'x'.repeat(121)},{privacyAccepted:false}]) {
    assert.notEqual(api.validateRequest(api.normaliseRequest({...valid,...change})), '');
  }
});
test('mailto encodes text and addresses only the configured recipient', () => {
  const api = core();
  const data = api.normaliseRequest({...valid,businessName:'A&B <script>alert(1)</script> ?subject=oops\nBcc:bad@example.test'});
  const body = api.buildRequestText(data,'2026-10-17');
  const url = new URL(api.buildMailto('hello@de-omega-point.com',body));
  assert.equal(url.protocol,'mailto:');
  assert.equal(url.pathname,'hello@de-omega-point.com');
  assert.equal(url.searchParams.get('body'),body);
  assert.deepEqual([...url.searchParams.keys()],['subject','body']);
  assert.equal(url.searchParams.has('bcc'),false);
  assert.throws(()=>api.buildMailto('bad@example.test?bcc=evil',body));
});
test('legacy removal touches only the two old prototype keys', () => {
  const deleted=[];
  core().forgetLegacyData({removeItem:key=>deleted.push(key)});
  assert.deepEqual(deleted,['l4a_orders','l4a_current_order']);
});
// Execute the production scripts against a small DOM harness. No backend or email is contacted.
function journey({clipboardFails=false, clipboardWrite, data=valid, nativeValid=true}={}) {
  const nodes=new Map();
  function element(key) {
    if (!nodes.has(key)) nodes.set(key,{hidden:key==='[data-request-review]',disabled:false,textContent:'',attributes:{},events:{},focus(){this.focused=true;},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];delete this[k];},addEventListener(k,fn){this.events[k]=fn;},async fire(event='click'){return await this.events[event]?.({preventDefault(){}});}});
    return nodes.get(key);
  }
  let values={...data};
  const form=element('[data-feedback-form]');
  form.reportValidity=()=>nativeValid;
  form.reset=()=>{values={};};
  const copies=[],files=[],revoked=[],timers=[];
  const FakeURL={createObjectURL:blob=>{files.push(blob);return 'blob:test';},revokeObjectURL:url=>revoked.push(url)};
  const window={location:{search:'?order=forged&plan=driver&paid=true'},get localStorage(){throw new Error('storage blocked');}};
  const context=vm.createContext({window,document:{querySelector:element,getElementById:element,body:{append(){}},createElement(){return {click(){},remove(){}};}},FormData:class {get(name){return typeof values[name]==='boolean'?(values[name]?'on':null):(values[name]??null);}},navigator:{clipboard:{writeText:async text=>{if(clipboardFails) throw Error('denied');if(clipboardWrite) await clipboardWrite(text);copies.push(text);}}},Blob,URL:FakeURL,setTimeout:fn=>timers.push(fn)});
  vm.runInContext(configSource,context);
  vm.runInContext(coreSource,context);
  vm.runInContext(checkoutSource,context);
  return {element,form,window,copies,files,revoked,timers,setValues:d=>values=d};
}
test('complete request journey: review, email hand-off, copy, edit and clear', async () => {
  const j=journey();
  assert.equal(j.element('[data-feedback-fields]').disabled,false);
  await j.form.fire('submit');
  assert.equal(j.form.hidden,true);
  assert.equal(j.element('[data-request-review]').hidden,false);
  assert.equal(j.element('review-title').focused,true);
  assert.match(j.element('[data-compose-email]').href,/^mailto:hello@de-omega-point.com\?/);
  assert.match(j.element('[data-request-text]').textContent,/owner@example.test/);
  await j.element('[data-compose-email]').fire();
  assert.match(j.element('[data-copy-status]').textContent,/cannot verify delivery/);
  await j.element('[data-copy-request]').fire();
  assert.equal(j.copies.length,1);
  await j.element('[data-edit-request]').fire();
  assert.equal(j.form.hidden,false);
  assert.equal(j.element('[data-compose-email]').href,undefined);
  assert.equal(j.element('feedbackMessage').focused,true);
  j.setValues({...valid,message:'An updated support question'});
  await j.form.fire('submit');
  assert.match(j.element('[data-request-text]').textContent,/An updated support question/);
  await j.element('[data-clear-request]').fire();
  assert.equal(j.element('[data-request-text]').textContent,'');
  assert.equal(j.element('[data-compose-email]').href,undefined);
  assert.equal(j.form.hidden,false);
  assert.equal(j.window.L4A_CONFIG.paymentsEnabled,false);
  assert.equal(j.window.L4A.confirmPaymentWithBackend,undefined);
});
test('clipboard denial and text download remain truthful and usable', async () => {
  const j=journey({clipboardFails:true});
  await j.form.fire('submit');
  await j.element('[data-copy-request]').fire();
  assert.match(j.element('[data-copy-status]').textContent,/Select and copy/);
  await j.element('[data-save-request]').fire();
  assert.equal(j.files.length,1);
  assert.match(await j.files[0].text(),/Example Test Café/);
  assert.match(j.element('[data-copy-status]').textContent,/does not submit/);
  j.timers.forEach(fn=>fn());
  assert.deepEqual(j.revoked,['blob:test']);
});
test('invalid input stays on the form without an email link', async () => {
  const j=journey({data:{...valid,email:'bad'}});
  await j.form.fire('submit');
  assert.equal(j.form.hidden,false);
  assert.equal(j.element('[data-request-review]').hidden,true);
  assert.equal(j.element('[data-compose-email]').href,undefined);
  assert.match(j.element('[data-form-message]').textContent,/valid contact email/);
});
test('untrusted input is rendered as text without executing HTML', async () => {
  const j=journey({data:{...valid,message:'<img src=x onerror=alert(1)>'}});
  await j.form.fire('submit');
  assert.match(j.element('[data-request-text]').textContent,/<img src=x/);
  assert.equal(j.element('[data-request-text]').innerHTML,undefined);
});
test('legacy URLs and storage cannot turn status pages into proof of access', () => {
  for(const file of ['success.html','download.html','admin.html']) {
    const html=readFileSync(file,'utf8');
    assert.doesNotMatch(html,/success\.js|download\.js|admin\.js|data-download-button|data-order-summary/);
  }
  assert.match(readFileSync('success.html','utf8'),/not a payment receipt/);
  const form=readFileSync('checkout.html','utf8');
  assert.match(form,/<fieldset disabled/);
  assert.match(form,/<noscript>/);
  assert.doesNotMatch(form,/name="updatesConsent"/);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
for (const action of ['clear-request', 'edit-request']) {
  for (const outcome of ['resolve', 'reject']) {
    test(`a delayed clipboard ${outcome} cannot overwrite a newer request after ${action}`, async () => {
      const operation = deferred();
      const j = journey({ clipboardWrite: () => operation.promise });
      await j.form.fire('submit');
      const copying = j.element('[data-copy-request]').fire();
      await j.element(`[data-${action}]`).fire();
      j.setValues({ ...valid, businessName: 'A different request' });
      await j.form.fire('submit');
      operation[outcome](new Error('clipboard denied'));
      await copying;
      assert.equal(j.element('[data-copy-status]').textContent, '');
      assert.match(j.element('[data-request-text]').textContent, /A different request/);
    });
  }
}
test('only the newest clipboard action may update the status', async () => {
  const first = deferred();
  let call = 0;
  const j = journey({ clipboardWrite: () => ++call === 1 ? first.promise : Promise.resolve() });
  await j.form.fire('submit');
  const stale = j.element('[data-copy-request]').fire();
  await j.element('[data-copy-request]').fire();
  first.reject(new Error('older clipboard denial'));
  await stale;
  assert.match(j.element('[data-copy-status]').textContent, /^Copied\./);
});
for (const action of ['compose-email', 'save-request']) {
  test(`pending clipboard status cannot replace a newer ${action} result`, async () => {
    const operation = deferred();
    const j = journey({ clipboardWrite: () => operation.promise });
    await j.form.fire('submit');
    const copying = j.element('[data-copy-request]').fire();
    await j.element(`[data-${action}]`).fire();
    const latestStatus = j.element('[data-copy-status]').textContent;
    operation.resolve();
    await copying;
    assert.equal(j.element('[data-copy-status]').textContent, latestStatus);
  });
}
test('blocked browser storage gives a helpful legacy-cleanup message without breaking the form', async () => {
  const j = journey();
  await j.element('[data-clear-legacy]').fire();
  assert.match(j.element('[data-legacy-status]').textContent, /Browser storage is unavailable/);
  await j.form.fire('submit');
  assert.equal(j.element('[data-request-review]').hidden, false);
});


test('only the message and privacy acknowledgement are required for feedback', () => {
  const api = core();
  const data = api.normaliseRequest({message:'  A helpful first use.\r\nOne question remains.  ',privacyAccepted:true});
  assert.equal(api.validateRequest(data), '');
  assert.equal(data.message, 'A helpful first use.\nOne question remains.');
  const text = api.buildRequestText(data, '2026-10-17');
  assert.match(text, /Preferred reply email: Use my sending address/);
  assert.match(text, /Business: Not provided/);
  assert.match(text, /Contact name: Not provided/);
  assert.equal(new URL(api.buildMailto('hello@de-omega-point.com',text)).searchParams.get('subject'), 'Loyalty-4-All feedback and support');
});

test('native invalidity and empty feedback cannot create a composed email', async () => {
  for (const options of [{nativeValid:false},{data:{...valid,message:'   '}}]) {
    const j = journey(options);
    await j.form.fire('submit');
    assert.equal(j.element('[data-request-review]').hidden,true);
    assert.equal(j.element('[data-compose-email]').href,undefined);
  }
});
