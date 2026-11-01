import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)));
const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
test('remote content has no native bridge or capability', () => {
  assert.deepEqual(config.app.security.capabilities, []);
  assert.equal(config.app.withGlobalTauri, false);
  assert.doesNotMatch(rust, /\.invoke_handler\(|\.plugin\(/);
  assert.match(rust, /NewWindowResponse::Deny/);
  assert.match(rust, /PermissionResponse::Deny/);
  assert.match(rust, /\.on_download\(\|_, _\| false\)/);
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
