import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)));
const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
test('remote content has no general native filesystem bridge or capability', () => {
  assert.deepEqual(config.app.security.capabilities, []);
  assert.equal(config.app.withGlobalTauri, false);
  assert.doesNotMatch(rust, /\.invoke_handler\(|\.plugin\(/);
  assert.match(rust, /NewWindowResponse::Deny/);
  assert.match(rust, /PermissionResponse::Deny/);
  assert.match(rust, /false \/\/ WebView disk downloads remain denied/);
  assert.match(rust, /\.on_download\(\|_, _\| false\)/);
  const policy = readFileSync(new URL('../src-tauri/src/export_policy.rs', import.meta.url), 'utf8');
  assert.match(policy, /create_new\(true\)/);
  assert.match(policy, /sync_all\(\)/);
  assert.match(policy, /bytes != text\.as_bytes\(\)/);
});
test('package contains only warning landing, never unregistered app core', () => {
  assert.deepEqual(readdirSync(new URL('../web', import.meta.url)), ['index.html']);
  assert.match(landing, /TEST ONLY|test only/);
  assert.match(landing, /Free forever/);
  assert.match(landing, /same email does not restore access/);
  assert.doesNotMatch(landing, /localStorage|document\.cookie|<script/);
});
test('hosted target stays HTTPS and exact-host checked; no updater', () => {
  assert.match(rust, /url\.scheme\(\) == "https"/);
  assert.match(rust, /url\.host_str\(\) == Some\(HOST\)/);
  assert.match(rust, /url\.port_or_known_default\(\) == Some\(443\)/);
  assert.equal(config.bundle.createUpdaterArtifacts, false);
});

test('evaluation error retires its watchdog before releasing native busy state', () => {
  const windows = readFileSync(new URL('../src-tauri/src/windows_export.rs', import.meta.url), 'utf8');
  assert.match(windows, /if result\.is_err\(\) && !called\.swap\(true, Ordering::SeqCst\)/);
  assert.match(windows, /if !called\.swap\(true, Ordering::SeqCst\) \{ state\.busy\.store\(false, Ordering::SeqCst\); abort\(&timeout_view, timeout_url\.as_str\(\)\)/);
});
