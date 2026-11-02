import { readdirSync, readFileSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
const target = process.argv[2];
if (!['aarch64-apple-darwin', 'x86_64-pc-windows-msvc', 'android-aarch64'].includes(target)) throw Error('Unknown target');
const root = target === 'android-aarch64' ? 'src-tauri/gen/android/app/build/outputs/apk' : `src-tauri/target/${target}/release/bundle`;
const extension = target === 'android-aarch64' ? '-unsigned.apk' : target.includes('apple') ? '.dmg' : '.msi';
function walk(path) { return readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(path,e.name)) : [join(path,e.name)]); }
const packages = walk(root).filter(path => path.endsWith(extension));
if (!packages.length) throw Error('No real native packages produced');
mkdirSync('evidence', { recursive: true });
const assets = packages.map(path => {
  const bytes = readFileSync(path);
  if (bytes.length < 10000) throw Error('Implausible package size');
  if (extension === '.msi' && bytes.subarray(0,8).toString('hex') !== 'd0cf11e0a1b11ae1') throw Error('Not an MSI compound file');
  if (extension === '.dmg' && bytes.subarray(-512,-508).toString() !== 'koly') throw Error('Not an Apple UDIF disk image');
  if (extension === '-unsigned.apk' && bytes.subarray(0,2).toString() !== 'PK') throw Error('Not an APK ZIP container');
  const name = basename(path); copyFileSync(path, join('evidence', name));
  return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
if (existsSync('src-tauri/Cargo.lock')) copyFileSync('src-tauri/Cargo.lock','evidence/Cargo.lock');
writeFileSync('evidence/build-evidence.json', JSON.stringify({ target, sourceCommit: process.env.GITHUB_SHA || null, runId: process.env.GITHUB_RUN_ID || null, status:'unsigned-test-only', customerReady:false, deviceAcceptance:false, registrationContinuity:false, offlineRelaunch:false, builtAt:new Date().toISOString(), assets },null,2)+'\n');
writeFileSync('evidence/NOT-A-CUSTOMER-RELEASE.txt','UNSIGNED TEST ONLY. No device acceptance. Hosted gate uses a separate profile. No customer data. Android unsigned APK cannot be installed normally. Do not bypass operating-system warnings. No public download link is authorized.\n');
console.log(JSON.stringify(assets,null,2));
