/**
 * Fail-closed unsigned-only preparation for Tauri CLI 2.12.4 Android prototypes.
 * Run AFTER `tauri android init --ci --skip-targets-install`, BEFORE any Gradle
 * task or `tauri android build --ci --apk --target aarch64`.
 * Does not invoke a build, signing tool, emulator or SDK installer.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const prototypeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marker = '// L4A UNSIGNED-ONLY PROTOTYPE GUARD v1';
export const guard = `
${marker}
// No release key, debug key, signing operation, or debug build is authorized.
android {
    buildTypes.configureEach {
        signingConfig = null
    }
}
gradle.taskGraph.whenReady {
    allTasks.forEach { task ->
        val n = task.name.lowercase()
        check(!n.contains("debug") &&
            !n.contains("validatesigning") &&
            !n.startsWith("sign") &&
            !(n.contains("keystore") && (n.contains("create") || n.contains("generate"))) &&
            !(n.contains("key") && n.contains("generate"))) {
            "L4A unsigned-only policy refuses task: " + task.path
        }
    }
}
`;
const signingCustomization = /\b(?:signingConfig\w*|keytool|storePassword|keyPassword|keyAlias|storeFile)\b|\.(?:jks|keystore)\b/iu;

export function prepareGradle(source) {
  if (source.includes(marker)) {
    if (!source.endsWith(guard)) throw new Error('Unsigned guard was modified or is not the final block.');
    source = source.slice(0, -guard.length);
  }
  if (signingCustomization.test(source)) throw new Error('Unexpected signing customization; refuse to alter or execute it.');
  for (const expected of ['id("com.android.application")', 'getByName("release")', 'getByName("debug")', 'apply(from = file("tauri.build.gradle.kts"))']) {
    if (!source.includes(expected)) throw new Error(`Unrecognized Tauri 2.12.4 Android template: missing ${expected}`);
  }
  return source + guard;
}

function inspectProject(directory, mainPath) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      // Tauri links compiled Rust libraries here during an ordinary APK build.
      const jniRoot = join(dirname(mainPath), 'src', 'main', 'jniLibs');
      if (path.startsWith(jniRoot + '/') && entry.name.endsWith('.so')) continue;
      throw new Error(`Unexpected symlink in generated project: ${path}`);
    }
    if (entry.isDirectory()) {
      // Build outputs/caches are neither edited nor scanned as source.
      if (!['build', '.gradle', '.idea'].includes(entry.name)) inspectProject(path, mainPath);
    } else {
      if (/\.(?:jks|keystore)$/iu.test(entry.name) || entry.name === 'keystore.properties') {
        throw new Error(`Signing material is not authorized: ${path}`);
      }
      if (/\.(?:gradle(?:\.kts)?|properties)$/u.test(entry.name) && path !== mainPath) {
        if (signingCustomization.test(readFileSync(path, 'utf8'))) throw new Error(`Unexpected signing configuration in ${path}`);
      }
    }
  }
}

export function selfTest() {
  const template = 'plugins { id("com.android.application") }\nandroid { buildTypes { getByName("release") {} getByName("debug") {} } }\napply(from = file("tauri.build.gradle.kts"))\n';
  const prepared = prepareGradle(template);
  assert.equal(prepareGradle(prepared), prepared, 'idempotent');
  for (const bad of ['signingConfig = signingConfigs.getByName("debug")', 'keytool', 'storePassword = "x"', 'file("test.keystore")', 'keyAlias = "x"']) {
    assert.throws(() => prepareGradle(template + bad), /Unexpected signing/);
  }
  assert.throws(() => prepareGradle(prepared + '\n'), /modified/);
  assert.throws(() => prepareGradle(''), /Unrecognized/);
  assert.match(prepared, /signingConfig = null/u);
  assert.match(prepared, /taskGraph.whenReady/u);
  console.log('Unsigned Android guard: 10 self-test assertions passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--self-test') {
      selfTest();
    } else {
      if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--check')) throw new Error('Usage: node scripts/prepare-android.mjs [--check|--self-test]');
      const pkg = JSON.parse(readFileSync(join(prototypeRoot, 'package.json'), 'utf8'));
      if (pkg.devDependencies?.['@tauri-apps/cli'] !== '2.12.4') throw new Error('Expected exactly pinned @tauri-apps/cli 2.12.4.');
      const project = join(prototypeRoot, 'src-tauri', 'gen', 'android');
      const mainPath = join(project, 'app', 'build.gradle.kts');
      inspectProject(project, mainPath);
      const source = readFileSync(mainPath, 'utf8');
      const prepared = prepareGradle(source);
      if (process.argv[2] === '--check') {
        if (source !== prepared) throw new Error('Unsigned guard is not installed.');
      } else if (source !== prepared) {
        writeFileSync(mainPath, prepared, 'utf8');
      }
      console.log('Unsigned-only Android configuration verified. No build or signing tool executed.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
