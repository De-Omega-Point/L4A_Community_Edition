import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { customerCode } from '../public/community/js/crm.js';
import { printMemberCard } from '../public/community/js/cards.js';
import { appState } from '../public/community/js/state.js';

test('automatic card numbers avoid current/imported numbers even after repeated entropy collisions', t => {
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:a=>a.fill(0)}});
 t.after(()=>Object.defineProperty(globalThis,'crypto',original));
 const old=Date.now;Date.now=()=>123456;t.after(()=>Date.now=old);
 const base=`CUST-${Date.now().toString(36).toUpperCase()}`;
 const legacy=[{token:'cust-222222'},{token:base},{token:`${base}-1`}];
 const snapshot=JSON.stringify(legacy);
 assert.equal(customerCode(legacy),`${base}-2`);
 assert.equal(JSON.stringify(legacy),snapshot);
 legacy.push({token:`${base}-2`});assert.equal(customerCode(legacy),`${base}-3`);
});

test('card printing requires explicit valid customer and renders only that identity', t=>{
 const oldDoc=globalThis.document,oldWin=globalThis.window,oldCustomers=appState.customers,oldSelected=appState.selectedCrmCustomerId;
 const nodes=new Map();const classes=new Set();const events=new Map();let printed=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',width:132,getContext:()=>({clearRect(){}})});return nodes.get(id);};
 globalThis.document={readyState:'complete',getElementById:node,body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}}};
 globalThis.window={addEventListener:(e,f)=>events.set(e,f),removeEventListener:e=>events.delete(e),print:()=>{printed++;assert.equal(node('cardCustomerName').textContent,'SYNTHETIC MEMBER A');assert.equal(classes.has('printing-member-card'),true);}};
 t.after(()=>{globalThis.document=oldDoc;globalThis.window=oldWin;appState.customers=oldCustomers;appState.selectedCrmCustomerId=oldSelected;});
 appState.customers=[{id:'synthetic-a',name:'SYNTHETIC MEMBER A',token:'CUST-TESTA',visits:2},{id:'synthetic-b',name:'DO NOT PRINT B',token:'CUST-TESTB'}];
 assert.equal(printMemberCard(null),false);assert.equal(printMemberCard('missing'),false);assert.equal(printed,0);
 appState.selectedCrmCustomerId='synthetic-b';
 assert.equal(printMemberCard('synthetic-a'),true);assert.equal(printed,1);
 assert.equal(classes.size,0);assert.equal(node('cardCustomerName').textContent,'DO NOT PRINT B');
 document.readyState='loading';assert.equal(printMemberCard('synthetic-a'),false);assert.equal(printed,1);document.readyState='complete';
 window.print=()=>{throw Error('print unavailable');};assert.equal(printMemberCard('synthetic-b'),false);assert.equal(classes.size,0);
});

test('print CSS excludes siblings at every card ancestor; visits and CRM use separate explicit selections',()=>{
 const css=readFileSync(new URL('../public/community/css/styles.css',import.meta.url),'utf8');
 const print=css.slice(css.indexOf('@media print'));
 for(const selector of ['body > *','#appShell > :not(#customerTools)','#customerTools > :not(#screen-customers)','#screen-customers > :not(.customer-workspace)','.customer-workspace > :not(.customer-detail-stack)','.customer-detail-stack > :not(.customer-profile-card)','.customer-profile-card > :not(#customerCardArea)','#customerCardArea > :not(#cardPreview)'])assert.ok(print.includes(selector),selector);
 const app=readFileSync(new URL('../public/community/js/app.js',import.meta.url),'utf8');
 assert.match(app,/printMemberCard\(appState.currentCustomerId\)/);assert.match(app,/printMemberCard\(appState.selectedCrmCustomerId\)/);
 const crm=readFileSync(new URL('../public/community/js/crm.js',import.meta.url),'utf8');
 assert.match(crm,/requestedToken \|\| customer\?\.token \|\| customerCode\(draft.customers\)/);
});
