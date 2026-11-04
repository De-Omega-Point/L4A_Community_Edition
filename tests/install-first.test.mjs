import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupDecision, installedContext, mountInstallFirst } from '../public/community/js/install-first.js';
test('browser is install-first even if registered; installation is not registration', () => {
  assert.equal(setupDecision({installed:false,online:true,registered:'verified',prepared:true}),'install');
  assert.equal(setupDecision({installed:true,online:true,registered:'unlinked',prepared:true}),'unlinked');
  assert.equal(setupDecision({installed:true,online:true,registered:'verified',prepared:false}),'ready');
});
test('offline access is honest local setup, not asserted registered identity', () => {
  assert.equal(setupDecision({installed:true,online:false,registered:'offline',prepared:true}),'offline');
  assert.equal(setupDecision({installed:true,online:false,registered:'offline',prepared:false}),'offline-unconfirmed');
  assert.equal(setupDecision({installed:true,online:true,registered:'unavailable',prepared:true}),'unavailable');
});
test('supports standalone display and iOS standalone indicator only as UX signal', () => {
  assert.equal(installedContext({matchMedia:()=>({matches:false}),navigator:{standalone:true}}),true);
  assert.equal(installedContext({matchMedia:()=>({matches:false}),navigator:{}}),false);
});
test('browser users can export; existing workspace offers CSV without unlocking browser use', async () => {
  for(const existing of [false,true]) {
    const names=['installFirst','customerTools','mainNav','installFirstTitle','installFirstMessage','offlineReadiness','btnConfirmSetup','btnLegacyWorkspace','installedRegistrationLink','installedUseStatus','btnInstallFirst','btnSetupBackup','setupStorageWarning','btnUsePreparedWorkspace'];
    const nodes=Object.fromEntries(names.map(n=>[n,Object.assign(new EventTarget(),{hidden:false,inert:false,textContent:'',disabled:false})]));
    const target=Object.assign(new EventTarget(),{matchMedia:()=>({matches:false}),navigator:{onLine:true}});let exports=0;let csvExports=0;
    Object.defineProperty(target, 'localStorage', {get(){throw Error('SecurityError');}});
    mountInstallFirst({hasExistingRecords:existing,storageWarning:existing?'Recovered records only':'',exportBackup:()=>exports++,exportCsv:()=>csvExports++,install:()=>{},doc:{getElementById:n=>nodes[n]},target,read:()=>assert.fail('browser registration request')});
    assert.equal(nodes.customerTools.hidden,true);assert.equal(nodes.btnLegacyWorkspace.hidden,!existing);
    if(existing){assert.equal(nodes.setupStorageWarning.hidden,false);assert.match(nodes.setupStorageWarning.textContent,/not a complete backup/);assert.equal(nodes.btnSetupBackup.textContent,'Export available recovered records');}
    nodes.btnSetupBackup.dispatchEvent(new Event('click'));assert.equal(exports,1);
    nodes.btnLegacyWorkspace.dispatchEvent(new Event('click'));assert.equal(nodes.customerTools.hidden,true);assert.equal(csvExports,existing?1:0);
  }
});
test('setup marker is excluded from customer backup and never contains a Product ID', () => {
 const source=readFileSync('public/community/js/install-first.js','utf8');
 assert.match(source,/setItem\(SETUP_KEY, 'ready'\)/);
 assert.doesNotMatch(readFileSync('public/community/js/state.js','utf8'),/installed-setup/);
 assert.match(source,/never server authorization/);
});
test('unreachable server with nominal connectivity allows explicit prepared local access, never confirmed unlinked', async () => {
 for (const state of ['unavailable','unlinked']) {
  const names=['installFirst','customerTools','mainNav','installFirstTitle','installFirstMessage','offlineReadiness','btnConfirmSetup','btnLegacyWorkspace','installedRegistrationLink','installedUseStatus','btnInstallFirst','btnSetupBackup','setupStorageWarning','btnUsePreparedWorkspace'];
  const nodes=Object.fromEntries(names.map(n=>[n,Object.assign(new EventTarget(),{hidden:false,inert:false,textContent:'',disabled:false})]));
  const target=Object.assign(new EventTarget(),{matchMedia:()=>({matches:true}),navigator:{onLine:true}});
  mountInstallFirst({hasExistingRecords:true,exportBackup:()=>{},exportCsv:()=>{},install:()=>{},doc:{getElementById:n=>nodes[n]},target,read:async()=>({state}),storage:{getItem:()=> 'ready'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes.customerTools.hidden,true);
  assert.equal(nodes.btnUsePreparedWorkspace.hidden,state==='unlinked');
  nodes.btnUsePreparedWorkspace.dispatchEvent(new Event('click'));
  assert.equal(nodes.customerTools.hidden,state==='unlinked');
  if(state==='unavailable') assert.match(nodes.installedUseStatus.textContent,/could not be reverified/);
 }
});
test('complete cached files with blocked setup storage never promises offline restart', async () => {
 const names=['installFirst','customerTools','mainNav','installFirstTitle','installFirstMessage','offlineReadiness','btnConfirmSetup','btnLegacyWorkspace','installedRegistrationLink','installedUseStatus','btnInstallFirst','btnSetupBackup','setupStorageWarning','btnUsePreparedWorkspace'];
 const nodes=Object.fromEntries(names.map(n=>[n,Object.assign(new EventTarget(),{hidden:false,inert:false,textContent:'',disabled:false})]));
 const target=Object.assign(new EventTarget(),{matchMedia:()=>({matches:true}),navigator:{onLine:true}});
 mountInstallFirst({hasExistingRecords:false,exportBackup:()=>{},exportCsv:()=>{},install:()=>{},doc:{getElementById:n=>nodes[n]},target,read:async()=>({state:'verified'}),shellReady:async()=>true,storage:{getItem(){throw Error('restricted');},setItem(){throw Error('restricted');}}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(nodes.customerTools.hidden,false);
 assert.match(nodes.installedUseStatus.textContent,/Offline restart cannot be confirmed/);
 assert.match(nodes.installedUseStatus.textContent,/storage is restricted/);
});
test('BFCache return rechecks locked setup but neither initial pageshow nor unlocked work', async () => {
 const names=['installFirst','customerTools','mainNav','installFirstTitle','installFirstMessage','offlineReadiness','btnConfirmSetup','btnLegacyWorkspace','installedRegistrationLink','installedUseStatus','btnInstallFirst','btnSetupBackup','setupStorageWarning','btnUsePreparedWorkspace'];
 const nodes=Object.fromEntries(names.map(n=>[n,Object.assign(new EventTarget(),{hidden:false,inert:false,textContent:'',disabled:false})]));
 const target=Object.assign(new EventTarget(),{matchMedia:()=>({matches:true}),navigator:{onLine:true}});
 let reads=0; let state='unlinked';
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 const pageshow=persisted=>{const event=new Event('pageshow');Object.defineProperty(event,'persisted',{value:persisted});target.dispatchEvent(event);};
 mountInstallFirst({hasExistingRecords:false,exportBackup:()=>{},exportCsv:()=>{},install:()=>{},doc:{getElementById:n=>nodes[n]},target,read:async()=>{reads++;return {state};},shellReady:async()=>true,storage:{getItem:()=>null,setItem:()=>{}}});
 await tick(); assert.equal(reads,1); assert.equal(nodes.customerTools.hidden,true);
 pageshow(false); await tick(); assert.equal(reads,1);
 pageshow(true); await tick(); assert.equal(reads,2); assert.equal(nodes.customerTools.hidden,true);
 state='verified'; pageshow(true); await tick(); assert.equal(reads,3); assert.equal(nodes.customerTools.hidden,false);
 state='unlinked'; pageshow(true); await tick(); assert.equal(reads,3); assert.equal(nodes.customerTools.hidden,false);
});
test('BFCache recheck aborts an older check and ignores its late verified receipt', async () => {
 const names=['installFirst','customerTools','mainNav','installFirstTitle','installFirstMessage','offlineReadiness','btnConfirmSetup','btnLegacyWorkspace','installedRegistrationLink','installedUseStatus','btnInstallFirst','btnSetupBackup','setupStorageWarning','btnUsePreparedWorkspace'];
 const nodes=Object.fromEntries(names.map(n=>[n,Object.assign(new EventTarget(),{hidden:false,inert:false,textContent:'',disabled:false})]));
 const target=Object.assign(new EventTarget(),{matchMedia:()=>({matches:true}),navigator:{onLine:true}});
 const requests=[];const tick=()=>new Promise(resolve=>setImmediate(resolve));
 mountInstallFirst({hasExistingRecords:false,exportBackup:()=>{},exportCsv:()=>{},install:()=>{},doc:{getElementById:n=>nodes[n]},target,read:({signal})=>new Promise(resolve=>requests.push({signal,resolve})),shellReady:async()=>true,storage:{getItem:()=>null,setItem:()=>{}}});
 const event=new Event('pageshow');Object.defineProperty(event,'persisted',{value:true});target.dispatchEvent(event);
 assert.equal(requests.length,2);assert.equal(requests[0].signal.aborted,true);
 requests[1].resolve({state:'unlinked'});await tick();
 requests[0].resolve({state:'verified'});await tick();
 assert.equal(nodes.customerTools.hidden,true);assert.equal(nodes.btnConfirmSetup.disabled,false);
 assert.match(nodes.installFirstTitle.textContent,/Registration is not linked/);
});
