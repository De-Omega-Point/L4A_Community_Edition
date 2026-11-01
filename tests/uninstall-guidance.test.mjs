import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountUninstallGuidance } from '../public/community/js/uninstall-guidance.js';
const html = readFileSync(new URL('../public/community/index.html', import.meta.url), 'utf8');
test('real buttons open one labelled native dialog with data warnings', () => {
 for (const id of ['btnSetupUninstall','btnSettingsUninstall']) assert.match(html,new RegExp(`<button[^>]+id="${id}"[^>]+aria-haspopup="dialog"[^>]*>Uninstall app</button>`));
 assert.match(html, /<dialog id="uninstallDialog"[^>]+aria-labelledby="uninstallDialogTitle"[^>]+aria-describedby="uninstallDialogIntro"/);
 for (const text of ['outside this app','stop and keep your older backups','does not restore your registration receipt','cannot uninstall itself','withdraw marketing consent','No request is sent automatically']) assert.ok(html.includes(text));
 assert.doesNotMatch(html, /<details class="spaced uninstall-guide"/);
});
function fixture() {
 let focused;
 const nodes = Object.fromEntries(['uninstallDialog','btnSetupUninstall','btnSettingsUninstall','btnSetupBackup','btnExportData','btnCloseUninstall','btnUninstallBackup'].map(id => [id,{id, dataset:{}, handlers:{}, addEventListener(e,f){this.handlers[e]=f;}, focus(){focused=id;}, showModal(){this.open=true;}, close(){this.open=false;this.handlers.close?.();}}]));
 mountUninstallGuidance({document:{getElementById:id=>nodes[id]}});
 return {nodes,focused:()=>focused};
}
test('both entry points close and restore opener; backup focuses original control without clicking', () => {
 for (const [entry,backup] of [['btnSetupUninstall','btnSetupBackup'],['btnSettingsUninstall','btnExportData']]) {
  const f=fixture(); f.nodes[entry].handlers.click();assert.equal(f.nodes.uninstallDialog.open,true);
  f.nodes.btnCloseUninstall.handlers.click();assert.equal(f.focused(),entry);
  f.nodes[entry].handlers.click();f.nodes.btnUninstallBackup.handlers.click();assert.equal(f.focused(),backup);assert.equal(f.nodes.uninstallDialog.open,false);
  f.nodes[entry].handlers.click();f.nodes.uninstallDialog.close();assert.equal(f.focused(),entry);
 }
});
test('guidance has no data or network mutation code and is cached with shell', () => {
 const code=readFileSync(new URL('../public/community/js/uninstall-guidance.js',import.meta.url),'utf8');
 assert.doesNotMatch(code,/fetch\(|localStorage|indexedDB|caches\.|\.removeItem\(|\.clear\(|\.click\(/);
 assert.match(readFileSync(new URL('../public/community/service-worker.js',import.meta.url),'utf8'), /'\.\/js\/uninstall-guidance\.js'/);
});
