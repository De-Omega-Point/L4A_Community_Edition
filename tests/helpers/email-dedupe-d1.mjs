// Synthetic in-memory Miniflare D1; no remote database or real registration.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {registerReceipt,REGISTRATION_NOTICE_VERSION} from '../../server/registration/core.mjs';
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("local only")}}',compatibilityDate:'2026-03-27',d1Databases:['DB'],d1Persist:false});
try{
 const db=await mf.getD1Database('DB');
 for(const statement of readFileSync('drizzle/0003_yellow_nightshade.sql','utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 const input={kind:'individual',contactName:'SYNTHETIC TEST',email:'test@example.com',termsAccepted:true,privacyAcknowledged:true,noticeVersion:REGISTRATION_NOTICE_VERSION};
 const requests=Array.from({length:20},(_,i)=>({db,receiptHash:i.toString(16).padStart(64,'0'),input:{...input,email:i%2?' TEST@EXAMPLE.COM ':input.email}}));
 const results=await Promise.allSettled(requests.map(r=>registerReceipt(r)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 for(const r of results.filter(r=>r.status==='rejected'))assert.equal(r.reason.code,'registration_review_needed');
 assert.equal((await db.prepare('SELECT count(*) AS n FROM registered_products').first()).n,1);
 const winner=results.findIndex(r=>r.status==='fulfilled');const repeat=await registerReceipt(requests[winner]);assert.equal(repeat.created,false);assert.equal(repeat.registration.id,results[winner].value.registration.id);
 console.log('Miniflare D1: 20 concurrent normalized-email attempts -> 1 registration; same receipt retry stable; no remote calls.');
}finally{await mf.dispose();}
