// Local presentation hints only: never authentication or proof of installation.
export function detectInstallPlatform({ userAgent = '', platform = '', maxTouchPoints = 0, standalone = false, nativePrompt = false } = {}) {
  if (standalone) return 'installed';
  if (nativePrompt) return 'prompt';
  if (/FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)/i.test(userAgent)) return 'inapp';
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Mac/i.test(platform || userAgent) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Firefox\//.test(userAgent) && /Mac/i.test(platform || userAgent)) return 'firefox-mac';
  if (/Edg\//.test(userAgent)) return 'edge';
  if (/Chrome\//.test(userAgent) && !/OPR\//.test(userAgent)) return 'chrome';
  if (/Macintosh/.test(userAgent) && /Safari\//.test(userAgent) && !/Chrome|Chromium/.test(userAgent)) return 'safari';
  return 'other';
}
const GUIDES = {
  installed: ['Opened in app-style mode', ['This window appears to be the installed app. Installation mode alone does not confirm your registration or offline readiness.', 'Use Check this app again to verify your digital registration receipt online.']],
  prompt: ['Your browser offers installation', ['Choose Install app to open the browser’s installation prompt.', 'After installation finishes, open the new Loyalty4All icon and stay online for the first registration and offline-file checks.']],
  ios: ['iPhone / iPad instructions', ['Open your browser’s Share menu, then Add to Home Screen. In Safari, use Edit Actions if the option is missing. If your browser does not offer it, open the full browser and check your registration receipt there first.', 'Enable Open as Web App if shown, then tap Add.', 'Open the new Loyalty4All icon and stay online for the first checks.']],
  android: ['Android instructions', ['In Chrome, open the menu → Install and create shortcut → Install, if available. Some versions show Add to home screen or Install app.', 'If only Create shortcut is offered, it may open a browser tab rather than install an app.', 'After installation finishes, open the new Loyalty4All icon and stay online for the first checks.']],
  chrome: ['Chrome computer instructions', ['Use the Install icon in the address bar, if offered. Otherwise open the menu → Cast, save and share → Install page as app.', 'Confirm installation, then open Loyalty4All from your computer’s apps and stay online for the first checks.']],
  edge: ['Microsoft Edge computer instructions', ['Open the menu → More tools → Apps → Install this site as an app, if available; some versions show Apps directly.', 'Confirm installation, then open Loyalty4All from your computer’s apps and stay online for the first checks.']],
  'firefox-mac': ['Firefox on Mac cannot install this web app', ['Firefox’s built-in web-app installation is currently Windows-only, not macOS.', 'Before changing browsers, export any existing local records. Your registration receipt and customer records do not automatically transfer to Safari or Chrome.', 'If already registered, confirm access in the intended browser first; if your receipt is missing, contact support rather than registering again. Once access is confirmed, use Safari Add to Dock on macOS Sonoma or later, or Chrome installation.', 'If you cannot install, return to setup and choose Continue in browser as a last option. Read and acknowledge the data-loss risks first; keep regular backups.']],
  safari: ['Safari on Mac instructions', ['On macOS Sonoma or later, open Safari → File → Add to Dock (or Share → Add to Dock).', 'Choose Add, then open Loyalty4All from the Dock and stay online for the first checks.']],
  inapp: ['You may be inside another app’s browser', ['Use that app’s menu to open this page in Safari on iPhone/iPad, or a supported browser such as Chrome on Android.', 'Check registration in the destination browser before installing. Your digital receipt and local records may not transfer between browsers; do not register again just to recover access.']],
  other: ['Choose the instructions for your device', ['Automatic detection could not identify a reliable installation route. Choose your device/browser below.', 'If your browser has no Install option, consider a supported browser after backing up existing records and confirming registration access there. A bookmark alone may not open as an installed app. Browser use remains a last option on the setup screen after a data-loss acknowledgement.']]
};
export function installGuide(hints, override = 'auto') {
  const detected = detectInstallPlatform(hints);
  const selected = override !== 'auto' && Object.hasOwn(GUIDES, override) && !['installed', 'prompt', 'inapp'].includes(override) ? override : detected;
  const [title, steps] = GUIDES[selected];
  return { detected, selected, title, steps: [...steps] };
}
export function mountInstallGuidance({ doc = document, target = window, hasPrompt = () => false, actionState = () => ({}) } = {}) {
  const select = doc.getElementById('installDeviceChoice');
  const render = () => {
    let hints = {};
    try { hints.nativePrompt = hasPrompt(); } catch { /* Manual instructions remain available. */ }
    try {
      hints = { ...hints, userAgent: target.navigator.userAgent, platform: target.navigator.platform, maxTouchPoints: target.navigator.maxTouchPoints,
        standalone: target.matchMedia?.('(display-mode: standalone)').matches === true || target.navigator.standalone === true };
    } catch { /* Restricted device hints must not prevent manual instructions. */ }
    const guide = installGuide(hints, select?.value || 'auto');
    const title = doc.getElementById('installDetected');
    if (title) title.textContent = guide.title + (guide.selected === guide.detected ? ' — detected locally; you can choose another guide.' : ' — your selected guide.');
    for (const id of ['installSteps', 'setupInstallSteps']) {
      const list = doc.getElementById(id); if (!list) continue;
      list.replaceChildren(...guide.steps.map(text => { const li = doc.createElement('li'); li.textContent = text; return li; }));
    }
    const action = actionState();
    for (const id of ['btnInstallApp', 'btnInstallFirst', 'btnDialogInstall']) {
      const button = doc.getElementById(id);
      if (button) button.textContent = action.pending ? 'Waiting for browser…'
        : action.observed ? 'Open the app icon'
        : hints.nativePrompt && !hints.standalone ? 'Install app' : 'Installation help';
    }
    const hint = doc.getElementById('installHint');
    if (hint) hint.textContent = guide.title;
    const summary = doc.getElementById('setupInstallSummary');
    if (summary) summary.textContent = guide.title;
    return guide;
  };
  select?.addEventListener('change', render);
  render();
  return { render };
}
