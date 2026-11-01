import assert from 'node:assert/strict';
import test from 'node:test';
import { appState } from '../public/community/js/state.js';
import { startCameraScanner, stopCameraScanner } from '../public/community/js/scanner.js';
import { installDom } from './helpers/local-storage.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(media) {
  const element = installDom();
  const events = [];
  let timers = 0;
  globalThis.window = { isSecureContext: true, dispatchEvent: event => events.push(event), setTimeout: () => ++timers };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: media } } });
  const video = element('cameraVideo');
  Object.assign(video, { readyState: 0, srcObject: null, play: async () => {}, pause() {}, setAttribute() {} });
  stopCameraScanner(); appState.camera.detector = null;
  appState.currentCustomerId = null;
  return { element, video, events, timers: () => timers };
}
function stream() { const track = { stops: 0, stop() { this.stops += 1; } }; return { getTracks: () => [track], track }; }
test('Stop or navigation while permission is pending stops the late stream without hidden scanning', async () => {
  const permission = deferred(); const ui = setup(() => permission.promise); const media = stream();
  const pending = startCameraScanner(); stopCameraScanner(); permission.resolve(media);
  assert.deepEqual(await pending, { ok: false, reason: 'cancelled' });
  assert.equal(media.track.stops, 1); assert.equal(appState.camera.scanning, false);
  assert.equal(appState.camera.stream, null); assert.equal(ui.video.srcObject, null);
  assert.equal(ui.element('cameraPanel').hidden, true); assert.equal(ui.timers(), 0);
});
test('repeated Start shares one permission request and cannot orphan a stream', async () => {
  const permission = deferred(); let calls = 0; setup(() => { calls += 1; return permission.promise; }); const media = stream();
  const first = startCameraScanner(); const second = startCameraScanner();
  assert.equal(first, second); assert.equal(calls, 1);
  permission.resolve(media); assert.equal((await first).ok, true); await second;
  stopCameraScanner(); assert.equal(media.track.stops, 1);
});
test('Stop then new Start cannot have its stream overwritten by an older late grant', async () => {
  const oldGrant = deferred(), newGrant = deferred(); let calls = 0;
  setup(() => (++calls === 1 ? oldGrant.promise : newGrant.promise));
  const oldStream = stream(), newStream = stream();
  const oldStart = startCameraScanner(); stopCameraScanner(); const newStart = startCameraScanner();
  newGrant.resolve(newStream); assert.equal((await newStart).ok, true);
  oldGrant.resolve(oldStream); assert.equal((await oldStart).reason, 'cancelled');
  assert.equal(oldStream.track.stops, 1); assert.equal(newStream.track.stops, 0);
  assert.equal(appState.camera.stream, newStream); stopCameraScanner();
});
test('late video.play completion after Stop cannot restart scanning', async () => {
  const media = stream(); const playback = deferred(); const ui = setup(async () => media);
  ui.video.play = () => playback.promise;
  const pending = startCameraScanner(); await tick(); stopCameraScanner(); playback.resolve();
  assert.equal((await pending).reason, 'cancelled'); assert.equal(media.track.stops, 1);
  assert.equal(appState.camera.scanning, false); assert.equal(ui.timers(), 0);
});
test('late decoder completion cannot select a customer or schedule another frame after Stop', async () => {
  const media = stream(); const decode = deferred(); const ui = setup(async () => media);
  ui.video.readyState = 2;
  appState.customers = [{ id: 'a', token: 'CUST-A', name: 'Synthetic A' }];
  class Detector { static async getSupportedFormats() { return ['qr_code']; } detect() { return decode.promise; } }
  globalThis.BarcodeDetector = Detector; window.BarcodeDetector = Detector;
  await startCameraScanner(); await tick(); stopCameraScanner(); appState.currentCustomerId = 'newer-selection';
  decode.resolve([{ rawValue: 'CUST-A' }]); await tick();
  assert.equal(appState.currentCustomerId, 'newer-selection'); assert.equal(ui.events.length, 0); assert.equal(ui.timers(), 0);
  delete globalThis.BarcodeDetector;
});
test('permission denial is not retried with additional camera requests', async () => {
  let calls = 0; setup(async () => { calls += 1; throw new DOMException('Denied', 'NotAllowedError'); });
  assert.equal((await startCameraScanner()).reason, 'permission_or_device'); assert.equal(calls, 1);
});
