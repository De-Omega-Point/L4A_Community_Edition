import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountInstallFirst, setupDecision } from '../public/community/js/install-first.js';
const choiceKey = 'loyalty4all.browser-risk-ack.v1';
const browserKey = 'loyalty4all.browser-setup.v1';
const installedKey = 'loyalty4all.installed-setup.v1';
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({state='verified', stored={}, online=true, restricted=false, installed=false, shell=true, delayedClose=false, delayedRead=false}={}) {
 const names=['installFirst','customerTools','mainNav','installFirstTitle','installFirstMessage','offlineReadiness','btnConfirmSetup','btnLegacyWorkspace','installedRegistrationLink','installedUseStatus','btnInstallFirst','btnSetupBackup','setupStorageWarning','btnUsePreparedWorkspace','btnBrowserFallback','browserRiskDialog','browserRiskAcknowledgement','btnAcceptBrowserRisk','btnCancelBrowserRisk','btnBrowserRiskBackup'];
 let focus; let reads=0; let exports=0;
 const nodes=Object.fromEntries(names.map(n=>[n,Object.assign(new EventTarget(),{hidden:false,inert:false,textContent:'',disabled:false,checked:false,open:false,focus(){focus=n;}})]));
 const dialog=nodes.browserRiskDialog;
 dialog.showModal=()=>{dialog.open=true;};
 dialog.close=()=>{dialog.open=false;if(delayedClose)setTimeout(()=>dialog.dispatchEvent(new Event('close')),0);else dialog.dispatchEvent(new Event('close'));};
 dialog.addEventListener('cancel',()=>dialog.close());
 const target=Object.assign(new EventTarget(),{matchMedia:()=>({matches:installed}),navigator:{onLine:online}});
 const storage={getItem:k=>{if(restricted)throw Error('blocked');return stored[k];},setItem:(k,v)=>{if(restricted)throw Error('blocked');stored[k]=v;}};
 mountInstallFirst({hasExistingRecords:true,exportBackup:()=>exports++,exportCsv:()=>{},install:()=>{},doc:{getElementById:n=>nodes[n]},target,storage,read:async()=>{reads++;if(delayedRead)await new Promise(resolve=>setTimeout(resolve,30));return {state};},shellReady:async()=>shell});
 const click=id=>nodes[id].dispatchEvent(new Event('click'));
 const ack=()=>{nodes.browserRiskAcknowledgement.checked=true;nodes.browserRiskAcknowledgement.dispatchEvent(new Event('change'));};
 return {nodes,stored,target,click,ack,focus:()=>focus,reads:()=>reads,exports:()=>exports};
}
test('browser acceptance only removes install UX gate, never receipt requirement',()=>{
 for(const state of ['verified','unlinked','unavailable']) assert.equal(setupDecision({installed:false,browserAccepted:true,online:true,registered:state,prepared:false}), state==='verified'?'ready':state);
});
test('no accidental consent from repeat open, unchecked accept, Cancel, Escape, Back or pagehide',async()=>{
 for(const dismiss of ['cancel','escape','popstate','pagehide']) {
  const f=fixture(); f.click('btnBrowserFallback'); f.click('btnBrowserFallback');
  f.click('btnAcceptBrowserRisk'); assert.equal(f.reads(),0);
  f.ack();
  if(dismiss==='cancel')f.click('btnCancelBrowserRisk');else if(dismiss==='escape')f.nodes.browserRiskDialog.dispatchEvent(new Event('cancel'));else f.target.dispatchEvent(new Event(dismiss));
  f.click('btnAcceptBrowserRisk'); await tick();
  assert.equal(f.nodes.customerTools.hidden,true);assert.equal(f.stored[choiceKey],undefined);assert.equal(f.focus(),'btnBrowserFallback');
  f.click('btnBrowserFallback');assert.equal(f.nodes.browserRiskAcknowledgement.checked,false);assert.equal(f.nodes.btnAcceptBrowserRisk.disabled,true);
 }
});
test('explicit acknowledgement checks receipt then opens browser tools and persists only browser UX flags',async()=>{
 const stored={'customer-records':'untouched'};const f=fixture({stored});
 f.click('btnBrowserFallback'); f.ack(); f.click('btnAcceptBrowserRisk'); f.click('btnAcceptBrowserRisk'); await tick();
 assert.equal(f.reads(),1);assert.equal(f.nodes.customerTools.hidden,false);assert.equal(f.focus(),'installedUseStatus');
 assert.equal(stored[choiceKey],'acknowledged');assert.equal(stored[browserKey],'ready');assert.equal(stored[installedKey],undefined);assert.equal(stored['customer-records'],'untouched');
 assert.match(f.nodes.installedUseStatus.textContent,/Browser workspace/);
 const reload=fixture({stored});await tick();assert.equal(reload.nodes.customerTools.hidden,false);
 const anotherBrowser=fixture();await tick();assert.equal(anotherBrowser.nodes.customerTools.hidden,true);assert.equal(anotherBrowser.reads(),0);
});
test('lost receipt never unlocked by acceptance or prepared marker',async()=>{
 const f=fixture({state:'unlinked',stored:{[browserKey]:'ready'}});f.click('btnBrowserFallback');f.ack();f.click('btnAcceptBrowserRisk');await tick();
 assert.equal(f.nodes.customerTools.hidden,true);assert.equal(f.nodes.btnUsePreparedWorkspace.hidden,true);
 f.click('btnUsePreparedWorkspace');assert.equal(f.nodes.customerTools.hidden,true);assert.match(f.nodes.installFirstMessage.textContent,/same email cannot recover/);
});
test('offline fallback requires browser consent and separate previously prepared browser workspace',async()=>{
 for(const stored of [{[installedKey]:'ready',[choiceKey]:'acknowledged'},{[browserKey]:'ready'},{[browserKey]:'ready',[choiceKey]:'acknowledged'}]){
  const f=fixture({state:'offline',online:false,stored});await tick();assert.equal(f.nodes.customerTools.hidden,!(stored[browserKey]&&stored[choiceKey]));
 }
});
test('restricted storage permits this acknowledged online session but no offline-restart promise',async()=>{
 const f=fixture({restricted:true});f.click('btnBrowserFallback');f.ack();f.click('btnAcceptBrowserRisk');await tick();assert.equal(f.nodes.customerTools.hidden,false);assert.match(f.nodes.installedUseStatus.textContent,/Offline restart cannot be confirmed/);assert.deepEqual(f.stored,{});
});
test('backup action dismisses warning without consent and focuses existing export',()=>{
 const f=fixture();f.click('btnBrowserFallback');f.ack();f.click('btnBrowserRiskBackup');assert.equal(f.focus(),'btnSetupBackup');assert.equal(f.stored[choiceKey],undefined);f.click('btnSetupBackup');assert.equal(f.exports(),1);assert.equal(f.nodes.customerTools.hidden,true);
});
test('installed receipt flow remains available without browser acknowledgement',async()=>{
 const f=fixture({installed:true});await tick();assert.equal(f.nodes.customerTools.hidden,false);assert.equal(f.nodes.btnBrowserFallback.hidden,true);assert.equal(f.stored[installedKey],'ready');assert.equal(f.stored[choiceKey],undefined);
});
test('risk warning covers local-loss limitations without promising private-mode detection or migration',()=>{
 const html=readFileSync('public/community/index.html','utf8');assert.match(html,/private browsing, device loss or device problems/);assert.match(html,/Both installed and browser workspaces need regular backups/);assert.match(html,/cannot reliably tell whether you are in private browsing/);assert.match(html,/no automatic migration or sync/);assert.match(html,/btnCancelBrowserRisk[^>]*autofocus/);
});

test('native-style asynchronous close focuses enabled setup title during receipt check then workspace',async()=>{
 const f=fixture({delayedClose:true,delayedRead:true});f.click('btnBrowserFallback');f.ack();f.click('btnAcceptBrowserRisk');
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.nodes.btnConfirmSetup.disabled,true);assert.equal(f.focus(),'installFirstTitle');
 await new Promise(resolve=>setTimeout(resolve,40));assert.equal(f.focus(),'installedUseStatus');assert.equal(f.nodes.customerTools.hidden,false);
});
