import { appState } from './state.js';
import { handleScan } from './rewards.js';

function getDetector() {
  if (!('BarcodeDetector' in window)) return null;
  if (!appState.camera.detector) {
    try { appState.camera.detector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'upc_a'] }); } catch { appState.camera.detector = null; }
  }
  return appState.camera.detector;
}

async function loopFrames() {
  if (!appState.camera.scanning) return;
  const detector = getDetector();
  const video = document.getElementById('cameraVideo');
  const cameraNotice = document.getElementById('cameraNotice');
  try {
    if (video.readyState >= 2) {
      let code = '';
      if (detector) {
        const matches = await detector.detect(video);
        code = String(matches[0]?.rawValue || '').trim();
      } else if (typeof window.jsQR === 'function' && video.videoWidth && video.videoHeight) {
        const canvas = appState.camera.fallbackCanvas || document.createElement('canvas');
        appState.camera.fallbackCanvas = canvas;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        code = String(window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data || '').trim();
      }
      if (code) {
        document.getElementById('scanInput').value = code;
        const customer = handleScan(code);
        cameraNotice.textContent = `Scanned: ${code}`;
        if (customer) {
          window.dispatchEvent(new CustomEvent('lfa:customer-scanned', { detail: { customerId: customer.id } }));
          stopCameraScanner();
          return;
        }
      }
    }
  } catch (err) {
    cameraNotice.textContent = `Decode issue: ${err.message}`;
  }
  appState.camera.frameTimer = setTimeout(loopFrames, 450);
}

export async function startCameraScanner() {
  const panel = document.getElementById('cameraPanel');
  const cameraNotice = document.getElementById('cameraNotice');
  if (!window.isSecureContext) {
    panel.hidden = false;
    cameraNotice.textContent = 'Camera requires HTTPS or localhost. If opened from a file, run a local server first.';
    return { ok: false, reason: 'insecure_context' };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    panel.hidden = false;
    cameraNotice.textContent = 'This browser does not support device camera access. Use manual token lookup.';
    return { ok: false, reason: 'unsupported' };
  }
  if (appState.camera.scanning) return { ok: true, reason: 'already_running' };
  try {
    const constraintsList = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false }
    ];
    let stream = null;
    for (const constraints of constraintsList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch {}
    }
    if (!stream) {
      panel.hidden = false;
      cameraNotice.textContent = 'Camera permission denied or device camera unavailable.';
      return { ok: false, reason: 'permission_or_device' };
    }
    appState.camera.stream = stream; appState.camera.scanning = true;
    const video = document.getElementById('cameraVideo');
    panel.hidden = false;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    cameraNotice.textContent = 'Camera connected. Point at customer QR code.';
    loopFrames();
    return { ok: true, reason: 'started' };
  } catch (err) {
    panel.hidden = false;
    cameraNotice.textContent = `Unable to start camera: ${err.message || 'Unknown error'}`;
    return { ok: false, reason: 'start_error' };
  }
}

export function stopCameraScanner() {
  if (appState.camera.frameTimer) clearTimeout(appState.camera.frameTimer);
  appState.camera.frameTimer = null;
  appState.camera.stream?.getTracks().forEach(t => t.stop());
  appState.camera.stream = null; appState.camera.scanning = false;
  const video = document.getElementById('cameraVideo');
  video.pause(); video.srcObject = null; document.getElementById('cameraPanel').hidden = true;
  return true;
}
