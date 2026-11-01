import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectInstallPlatform, installGuide, mountInstallGuidance } from '../public/community/js/install-guidance.js';

test('capability and app-style mode precede device guesses without proving registration',()=>{
 assert.equal(detectInstallPlatform({standalone:true,nativePrompt:true,userAgent:'Android Chrome/1'}),'installed');
 assert.equal(detectInstallPlatform({nativePrompt:true,userAgent:'Unknown'}),'prompt');
 assert.match(installGuide({standalone:true}).steps.join(' '),/does not confirm your registration/);
});
test('device hints cover iPad desktop UA, iOS browsers, Android, desktop Edge/Chrome/Safari and unknown',()=>{
 const cases=[['ios',{userAgent:'Mozilla Macintosh Safari/605',platform:'MacIntel',maxTouchPoints:5}],['safari',{userAgent:'Mozilla Macintosh Safari/605',platform:'MacIntel',maxTouchPoints:0}],['ios',{userAgent:'iPhone CriOS/100 Mobile Safari/605'}],['android',{userAgent:'Android Chrome/100'}],['edge',{userAgent:'Windows Chrome/100 Edg/100'}],['chrome',{userAgent:'Macintosh Chrome/100 Safari/605'}],['firefox-mac',{userAgent:'Macintosh Firefox/144',platform:'MacIntel'}],['other',{userAgent:'Linux Firefox/100'}],['edge',{userAgent:'Windows Chrome/100 Edg/100',platform:'Win32',maxTouchPoints:10}],['inapp',{userAgent:'iPhone Instagram'}],['inapp',{userAgent:'Android; wv) Chrome/100'}]];
 for(const [want,hints] of cases)assert.equal(detectInstallPlatform(hints),want);
});
test('manual override is local guidance only and never changes standalone or authentication',()=>{
 const g=installGuide({standalone:true},'safari');assert.equal(g.detected,'installed');assert.equal(g.selected,'safari');assert.match(g.steps.join(' '),/Sonoma or later/);
 assert.equal(installGuide({},'__proto__').selected,'other');assert.equal(installGuide({},'prompt').selected,'other');
 assert.match(installGuide({userAgent:'iPhone'}).steps.join(' '),/Share menu/);
});
test('mount updates both instruction lists and responds to manual choice without tracking',()=>{
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'auto',textContent:'',listeners:{},addEventListener(e,f){this.listeners[e]=f;},replaceChildren(...items){this.items=items;}});return nodes.get(id);};
 const doc={getElementById:node,createElement:()=>({textContent:''})};let prompt=false;
 const guide=mountInstallGuidance({doc,target:{navigator:{userAgent:'Macintosh Safari/605',platform:'MacIntel',maxTouchPoints:0},matchMedia:()=>({matches:false})},hasPrompt:()=>prompt});
 assert.match(node('installDetected').textContent,/Safari on Mac/);assert.equal(node('installSteps').items.length,2);assert.equal(node('setupInstallSteps').items.length,2);
 prompt=true;guide.render();assert.match(node('installDetected').textContent,/browser offers installation/);
 node('installDeviceChoice').value='edge';node('installDeviceChoice').listeners.change();assert.match(node('installDetected').textContent,/your selected guide/);assert.match(node('installSteps').items[0].textContent,/Edge|Apps/);
 const restricted={get navigator(){throw new Error('restricted');}};mountInstallGuidance({doc,target:restricted});node('installDeviceChoice').value='auto';assert.equal(installGuide({}).selected,'other');
 const source=readFileSync(new URL('../public/community/js/install-guidance.js',import.meta.url),'utf8');assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|sendBeacon|\.prompt\(/);
 const sw=readFileSync(new URL('../public/community/service-worker.js',import.meta.url),'utf8');assert.match(sw,/\.\/js\/install-guidance\.js/);
});

test('Firefox Mac has explicit unsupported-install and safe receipt/backup guidance',()=>{
 const g=installGuide({userAgent:'Macintosh Firefox/144',platform:'MacIntel'});
 assert.equal(g.selected,'firefox-mac');assert.match(g.title,/cannot install/);
 assert.match(g.steps.join(' '),/Windows-only/);assert.match(g.steps.join(' '),/export any existing local records/);assert.match(g.steps.join(' '),/rather than registering again/);
});


test('manual guide rerenders preserve pending and observed installation labels', () => {
 const nodes = new Map();
 const node = id => {
  if (!nodes.has(id)) nodes.set(id, {value:'auto', textContent:'', listeners:{}, addEventListener(event, fn){this.listeners[event]=fn;}, replaceChildren(){}});
  return nodes.get(id);
 };
 let action = {pending:true, observed:false};
 const guidance = mountInstallGuidance({doc:{getElementById:node, createElement:()=>({})}, target:{navigator:{}, matchMedia:()=>({matches:false})}, actionState:()=>action});
 node('installDeviceChoice').value='firefox-mac'; node('installDeviceChoice').listeners.change();
 for(const id of ['btnInstallApp','btnInstallFirst','btnDialogInstall']) assert.equal(node(id).textContent,'Waiting for browser…');
 action={pending:false, observed:true};
 node('installDeviceChoice').value='chrome'; node('installDeviceChoice').listeners.change();
 guidance.render();
 for(const id of ['btnInstallApp','btnInstallFirst','btnDialogInstall']) assert.equal(node(id).textContent,'Open the app icon');
 action={pending:false, observed:false}; guidance.render();
 assert.equal(node('btnInstallFirst').textContent,'Installation help');
});
