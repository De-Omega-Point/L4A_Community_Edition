import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('public/community/js/app.js');
const code=source.slice(source.indexOf('export async function exportData'),source.indexOf('async function exportCustomersCsv')).replace('export async function','async function');
function fixture(fail=false){
 const calls=[];
 const context={waitForPendingChanges:async()=>({warning:''}),serialisableState:()=>({customers:[]}),backupFilename:()=> 'test.json',downloadTextFile(){calls.push('requested');if(fail)throw new Error('Browser blocked download');},markBackupCreated(){calls.push('timestamp');},updateBackupStatus(){},toast(message){calls.push(message);}};
 vm.createContext(context);vm.runInContext(code,context);return{context,calls};
}
test('PWA backup request never claims verified browser file completion',async()=>{
 const {context,calls}=fixture();await context.exportData();assert.equal(calls[0],'requested');assert.equal(calls[1],'timestamp');assert.match(calls[2],/cannot confirm/);assert.doesNotMatch(calls[2],/Backup downloaded/);
});
test('a blocked browser export does not record a new backup request or success',async()=>{
 const {context,calls}=fixture(true);await assert.rejects(context.exportData(),/blocked download/);assert.deepEqual(calls,['requested']);
});
test('historical backup timestamps are explicitly unverified, not migrated to proof',()=>{
 assert.match(read('public/community/index.html'),/Last backup request \(not verified\)/);assert.match(source,/Requested \$\{new Date\(value\).*check the saved file/);
});
test('simple PWA installation needs no ZIP or store and preserves authenticated manifest',()=>{
 const html=read('public/community/index.html');assert.match(html,/No ZIP file, app store or separate installer is needed/);assert.match(html,/rel="manifest"[^>]*crossorigin="use-credentials"|crossorigin="use-credentials"[^>]*rel="manifest"/);
 assert.doesNotMatch(source,/L4ANative|native-export|__TAURI/);assert.match(read('app/page.tsx'),/Install from your browser/);
});

test('small-screen navigation labels stay whole and registration copy matches the gate',()=>{
 assert.match(read('public/community/css/styles.css'),/white-space: nowrap; flex: 1 1 auto/);
 assert.match(read('public/community/index.html'),/Free registration is required/);
});
