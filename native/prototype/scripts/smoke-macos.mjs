// Read-only image inspection. Never removes quarantine or bypasses Gatekeeper.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const run = (tool,args) => { const r=spawnSync(tool,args,{encoding:'utf8',timeout:30000}); return {status:r.status,output:(r.stdout||'')+(r.stderr||'')}; };
const evidence=JSON.parse(readFileSync('evidence/build-evidence.json'));
const dmg=join(process.cwd(),'evidence',evidence.assets[0].name);
const mount=mkdtempSync(join(process.env.RUNNER_TEMP,'l4a-mount-'));
const report={platform:'macos',sourceCommit:evidence.sourceCommit,packageSha256:evidence.assets[0].sha256,deviceAcceptance:false,registrationTested:false,offlineTested:false};
let mounted=false;
try {
  report.imageVerification=run('hdiutil',['verify',dmg]);
  if(report.imageVerification.status!==0) throw Error('DMG verification failed');
  const attach=run('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);
  if(attach.status!==0) throw Error(attach.output); mounted=true;
  const app=join(mount,readdirSync(mount).find(x=>x.endsWith('.app'))||'MISSING');
  const executable=join(app,'Contents/MacOS/l4a-community-prototype');
  report.binary=run('file',[executable]);
  if(!report.binary.output.includes('Mach-O 64-bit executable arm64')) throw Error('Unexpected native architecture');
  report.bundle=run('plutil',['-p',join(app,'Contents/Info.plist')]);
  report.codeSignature=run('codesign',['-dvv',app]);
  report.gatekeeper=run('spctl',['--assess','--type','execute','-vv',app]);
  if(report.gatekeeper.status!==0){
    report.startup='BLOCKED_BY_GATEKEEPER_NO_BYPASS_ATTEMPTED';
  }else{
    report.launch=run('open',['-n',app]);
    await new Promise(resolve=>setTimeout(resolve,8000));
    const processes=run('ps',['-axo','pid=,command=']).output.split('\n').filter(x=>x.includes(executable));
    report.startup=processes.length?'PROCESS_RUNNING_ONLY':'NO_PROCESS_OBSERVED';
    if(!processes.length) throw Error('Native process not observed after permitted launch');
    for(const processLine of processes){ const pid=Number(processLine.trim().split(/\s/u)[0]); if(pid>1) run('kill',[String(pid)]); }
  }
}catch(error){ report.error=error.message; process.exitCode=1; }
finally{ if(mounted) report.detach=run('hdiutil',['detach',mount]); writeFileSync('evidence/macos-smoke.json',JSON.stringify(report,null,2)+'\n'); }
console.log(JSON.stringify(report,null,2));
