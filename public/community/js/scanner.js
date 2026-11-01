import { appState } from './state.js';
import { handleScan } from './rewards.js';

let generation = 0;
let pendingStart = null;
const stoppedStreams = new WeakSet();
function stopStream(stream) {
  if (!stream || stoppedStreams.has(stream)) return;
  stoppedStreams.add(stream);
  stream.getTracks().forEach(track => track.stop());
}

async function getDetector() {
  if (!('BarcodeDetector' in window)) return null;
  if (appState.camera.detector) return appState.camera.detector;
  try {
    const formats = typeof BarcodeDetector.getSupportedFormats === 'function'
      ? await BarcodeDetector.getSupportedFormats()
      : ['qr_code'];
    if (!formats.includes('qr_code')) return null;
    appState.camera.detector = new BarcodeDetector({ formats: ['qr_code'] });
    return appState.camera.detector;
  } catch {
    return null;
  }
}

function decodeWithJsQr(video) {
  if (typeof window.jsQR !== 'function' || !video.videoWidth || !video.videoHeight) return '';
  const canvas = appState.camera.fallbackCanvas || document.createElement('canvas');
  appState.camera.fallbackCanvas = canvas;
  const maximumWidth = 900;
  const scale = Math.min(1, maximumWidth / video.videoWidth);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '';
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return String(window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data || '').trim();
}

async function decodeFrame(video) {
  const detector = await getDetector();
  if (detector) {
    try {
      const matches = await detector.detect(video);
      const detected = String(matches[0]?.rawValue || '').trim();
      if (detected) return detected;
    } catch {
      appState.camera.detector = null;
    }
  }
  return decodeWithJsQr(video);
}

async function loopFrames(requestGeneration) {
  if (requestGeneration !== generation || !appState.camera.scanning) return;
  const video = document.getElementById('cameraVideo');
  const cameraNotice = document.getElementById('cameraNotice');
  try {
    if (video.readyState >= 2) {
      const code = await decodeFrame(video);
      if (requestGeneration !== generation || !appState.camera.scanning) return;
      if (code) {
        document.getElementById('scanInput').value = code;
        const customer = handleScan(code);
        if (customer) {
          cameraNotice.textContent = `Found ${customer.name}.`;
          window.dispatchEvent(new CustomEvent('lfa:customer-scanned', { detail: { customerId: customer.id } }));
          stopCameraScanner();
          return;
        }
        cameraNotice.textContent = 'QR read, but no customer matched. Try another card.';
      }
    }
  } catch {
    if (requestGeneration !== generation || !appState.camera.scanning) return;
    cameraNotice.textContent = 'Still looking for a clear QR code…';
  }
  if (requestGeneration === generation && appState.camera.scanning) {
    appState.camera.frameTimer = window.setTimeout(() => { void loopFrames(requestGeneration); }, 280);
  }
}

export function startCameraScanner() {
  if (pendingStart) return pendingStart;
  if (appState.camera.scanning) return Promise.resolve({ ok: true, reason: 'already_running' });
  const requestGeneration = ++generation;
  const pending = startCamera(requestGeneration);
  pendingStart = pending;
  const clearPending = () => { if (pendingStart === pending) pendingStart = null; };
  void pending.then(clearPending, clearPending);
  return pending;
}

async function startCamera(requestGeneration) {
  const panel = document.getElementById('cameraPanel');
  const cameraNotice = document.getElementById('cameraNotice');
  panel.hidden = false;

  if (!window.isSecureContext) {
    cameraNotice.textContent = 'Camera access needs a secure connection. Enter the customer code instead.';
    return { ok: false, reason: 'insecure_context' };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraNotice.textContent = 'This browser cannot open the camera. Enter the customer code instead.';
    return { ok: false, reason: 'unsupported' };
  }

  const constraintsList = [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: true, audio: false }
  ];

  let stream = null;
  for (const constraints of constraintsList) {
    if (requestGeneration !== generation) return { ok: false, reason: 'cancelled' };
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (requestGeneration !== generation) { stopStream(stream); return { ok: false, reason: 'cancelled' }; }
      if (stream) break;
    } catch (error) {
      if (requestGeneration !== generation) return { ok: false, reason: 'cancelled' };
      if (['NotAllowedError', 'SecurityError'].includes(error.name)) break;
    }
  }

  if (!stream) {
    cameraNotice.textContent = 'Camera permission was not granted or no camera is available. Enter the customer code instead.';
    return { ok: false, reason: 'permission_or_device' };
  }

  try {
    appState.camera.stream = stream;
    appState.camera.scanning = true;
    const video = document.getElementById('cameraVideo');
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    if (requestGeneration !== generation) { stopStream(stream); return { ok: false, reason: 'cancelled' }; }
    cameraNotice.textContent = 'Point the camera at the customer QR code.';
    void loopFrames(requestGeneration);
    return { ok: true, reason: 'started' };
  } catch {
    stopStream(stream);
    if (requestGeneration !== generation) return { ok: false, reason: 'cancelled' };
    const video = document.getElementById('cameraVideo');
    if (video?.srcObject === stream) { video.pause(); video.srcObject = null; }
    appState.camera.stream = null;
    appState.camera.scanning = false;
    cameraNotice.textContent = 'The camera could not start. Enter the customer code instead.';
    return { ok: false, reason: 'start_error' };
  }
}

export function stopCameraScanner() {
  generation += 1;
  pendingStart = null;
  if (appState.camera.frameTimer) clearTimeout(appState.camera.frameTimer);
  appState.camera.frameTimer = null;
  stopStream(appState.camera.stream);
  appState.camera.stream = null;
  appState.camera.scanning = false;
  const video = document.getElementById('cameraVideo');
  if (video) {
    video.pause();
    video.srcObject = null;
  }
  const panel = document.getElementById('cameraPanel');
  if (panel) panel.hidden = true;
  return true;
}
