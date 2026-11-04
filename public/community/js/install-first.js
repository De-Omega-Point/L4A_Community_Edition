import { readRegisteredProduct } from './registered-product.js';
const SETUP_KEY = 'loyalty4all.installed-setup.v1';
const BROWSER_CHOICE_KEY = 'loyalty4all.browser-risk-ack.v1';
const BROWSER_SETUP_KEY = 'loyalty4all.browser-setup.v1';
// This local flag is ONLY a UX/offline readiness hint, never server authorization,
// a Product ID, identity proof, or a transferable registration credential.
export function installedContext(target = window) {
  return target.matchMedia('(display-mode: standalone)').matches || target.navigator.standalone === true;
}
export function setupDecision({ installed, online, registered, prepared, browserAccepted = false }) {
  if (!installed && !browserAccepted) return 'install';
  if (registered === 'verified') return 'ready';
  if (!online && prepared) return 'offline';
  if (!online) return 'offline-unconfirmed';
  return registered === 'unlinked' ? 'unlinked' : 'unavailable';
}
export function offlineShellReady({ serviceWorker = navigator.serviceWorker, timeoutMs = 8000 } = {}) {
  return new Promise(resolve => {
    let settled = false;
    let replyPort;
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); replyPort?.close(); resolve(value); } };
    const timer = setTimeout(() => finish(false), timeoutMs);
    if (!serviceWorker) return finish(false);
    serviceWorker.ready.then(registration => {
      if (settled) return;
      if (!registration.active) return finish(false);
      const channel = new MessageChannel();
      replyPort = channel.port1;
      channel.port1.onmessage = event => { channel.port1.close(); finish(event.data?.type === 'L4A_SHELL_STATUS' && event.data.ready === true); };
      registration.active.postMessage({ type: 'L4A_CHECK_SHELL' }, [channel.port2]);
    }).catch(() => finish(false));
  });
}
export function mountInstallFirst({ hasExistingRecords, storageWarning = '', exportBackup, exportCsv, install, doc = document, target = window, read = readRegisteredProduct, shellReady = offlineShellReady, storage } = {}) {
  if (storage === undefined) { try { storage = target.localStorage; } catch { storage = null; } }
  const panel = doc.getElementById('installFirst');
  const tools = doc.getElementById('customerTools');
  const nav = doc.getElementById('mainNav');
  const title = doc.getElementById('installFirstTitle');
  const message = doc.getElementById('installFirstMessage');
  const readiness = doc.getElementById('offlineReadiness');
  const warning = doc.getElementById('setupStorageWarning');
  if (warning && storageWarning) {
    warning.hidden = false;
    warning.textContent = storageWarning + ' Export may contain only available recovered records, not a complete backup. Keep earlier backups and do not clear website data.';
    doc.getElementById('btnSetupBackup').textContent = 'Export available recovered records';
  }
  const retry = doc.getElementById('btnConfirmSetup');
  const legacy = doc.getElementById('btnLegacyWorkspace');
  const registration = doc.getElementById('installedRegistrationLink');
  const localFallback = doc.getElementById('btnUsePreparedWorkspace');
  const browserButton = doc.getElementById('btnBrowserFallback');
  const dialog = doc.getElementById('browserRiskDialog');
  const acknowledge = doc.getElementById('browserRiskAcknowledgement');
  const accept = doc.getElementById('btnAcceptBrowserRisk');
  let browserAccepted = false;
  try { browserAccepted = storage?.getItem(BROWSER_CHOICE_KEY) === 'acknowledged'; } catch {}
  let dialogReturnTarget;
  browserButton?.addEventListener('click', () => {
    if (!dialog || dialog.open) return;
    acknowledge.checked = false;
    accept.disabled = true;
    dialogReturnTarget = browserButton;
    dialog.showModal();
  });
  acknowledge?.addEventListener('change', () => { accept.disabled = !acknowledge.checked; });
  doc.getElementById('btnCancelBrowserRisk')?.addEventListener('click', () => dialog.close());
  doc.getElementById('btnBrowserRiskBackup')?.addEventListener('click', () => {
    dialogReturnTarget = doc.getElementById('btnSetupBackup');
    dialog.close();
  });
  dialog?.addEventListener('close', () => {
    if (dialog.open) return;
    acknowledge.checked = false; accept.disabled = true;
    (accessGranted ? doc.getElementById('installedUseStatus') : dialogReturnTarget)?.focus();
    dialogReturnTarget = null;
  });
  // Back/forward or a restored page must never turn a dismissed warning into consent.
  target.addEventListener('pagehide', () => { if (dialog?.open) dialog.close(); });
  target.addEventListener('popstate', () => { if (dialog?.open) dialog.close(); });
  accept?.addEventListener('click', () => {
    if (!dialog.open || !acknowledge.checked || accept.disabled) return;
    browserAccepted = true;
    try { storage?.setItem(BROWSER_CHOICE_KEY, 'acknowledged'); } catch {}
    dialogReturnTarget = title;
    dialog.close();
    void check();
  });
  let canUsePrepared = false;
  let sequence = 0;
  let accessGranted = false;
  let currentController;
  const prepared = () => { try { return storage.getItem(installedContext(target) ? SETUP_KEY : BROWSER_SETUP_KEY) === 'ready'; } catch { return false; } };
  function unlock() { accessGranted = true; tools.hidden = false; tools.inert = false; nav.hidden = false; panel.hidden = true; doc.getElementById('installedUseStatus')?.focus?.(); }
  function lock() { tools.hidden = true; tools.inert = true; nav.hidden = true; panel.hidden = false; }
  async function check() {
    const run = ++sequence;
    currentController?.abort();
    const controller = new AbortController(); currentController = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    lock(); retry.disabled = true; registration.hidden = true;
    canUsePrepared = false; localFallback.hidden = true;
    title.textContent = 'Install the app — recommended';
    message.textContent = 'Install Loyalty4All, then open its icon on this device. If installation is not an option, Continue in browser is available below after reviewing the data-loss risks. Registration and local records are not automatically shared between browser and app.';
    readiness.textContent = 'Offline readiness has not been confirmed in this workspace.';
    const installed = installedContext(target);
    legacy.hidden = !hasExistingRecords;
    if (browserButton) browserButton.hidden = installed;
    const context = installed ? 'Installed app' : 'Browser workspace';
    try {
      if (!installed && !browserAccepted) return;
      title.textContent = 'Confirming registration in this app…';
      const online = target.navigator.onLine !== false;
      const result = await read({ online, signal: controller.signal });
      if (run !== sequence) return;
      const decision = setupDecision({ installed, online, registered: result.state, prepared: prepared(), browserAccepted });
      if (decision === 'ready') {
        title.textContent = 'Registration confirmed — preparing offline files';
        message.textContent = 'Keep this app open and connected while we check its offline files.';
        const ready = await shellReady();
        if (run !== sequence) return;
        let persisted = false;
        if (ready) { try { if (installed) storage.setItem(SETUP_KEY, 'ready'); else storage.setItem(BROWSER_SETUP_KEY, 'ready'); persisted = prepared(); } catch {} }
        doc.getElementById('installedUseStatus').textContent = ready && !persisted
          ? context + ' · Online use ready. Offline restart cannot be confirmed because device storage is restricted. Keep backups.'
          : ready
          ? context + ' · Offline files checked. Keep regular backups; device storage can be cleared.'
          : context + ' · Online use ready. Offline files could not be confirmed; reconnect and reopen before relying on offline use.';
        unlock(); return;
      }
      if (decision === 'offline') {
        doc.getElementById('installedUseStatus').textContent = 'Offline · Using previously prepared local workspace. Registration cannot be reverified until you reconnect. Keep backups.';
        unlock(); return;
      }
      title.textContent = decision === 'unlinked' ? 'Registration is not linked to this workspace' : 'Connect to finish setting up this app';
      message.textContent = decision === 'unlinked'
        ? 'This workspace has no registered receipt. If you already registered elsewhere, use the original browser or app. A Product ID or registering again with the same email cannot recover access. Contact support; secure receipt recovery is not available here.'
        : 'An online registration check and offline-file preparation are needed once in this workspace. Existing local records are preserved and can still be exported below.';
      registration.hidden = decision !== 'unlinked';
      canUsePrepared = decision === 'unavailable' && prepared();
      localFallback.hidden = !canUsePrepared;
      if (canUsePrepared) message.textContent = 'The registration server could not be reached or checked. You can continue with the local workspace previously prepared here. Registration remains unverified; reconnect to check it. No data is synced.';
    } catch {
      if (run === sequence) { title.textContent = 'Registration could not be checked'; message.textContent = 'Reconnect and try again. Your existing records have not been changed and can still be exported below.'; }
    } finally { clearTimeout(timeout); if (run === sequence) retry.disabled = false; }
  }
  doc.getElementById('btnInstallFirst').addEventListener('click', install);
  async function exportSafely(action, button) {
    button.disabled = true;
    try {
      await action();
      readiness.textContent = doc.getElementById('dataNotice')?.textContent || 'Export requested. Check your downloads and keep the file safe.';
    } catch {
      readiness.textContent = 'Export could not complete. Your existing records have not been cleared. Try again or contact support before changing devices.';
    } finally { button.disabled = false; }
  }
  const backupButton = doc.getElementById('btnSetupBackup');
  backupButton.addEventListener('click', () => void exportSafely(exportBackup, backupButton));
  legacy.addEventListener('click', () => { if (hasExistingRecords) void exportSafely(exportCsv, legacy); });
  localFallback.addEventListener('click', () => {
    if (!canUsePrepared) return;
    doc.getElementById('installedUseStatus').textContent = 'Local workspace only · Registration could not be reverified. Using previously prepared files; no data is synced. Keep backups.';
    unlock();
  });
  retry.addEventListener('click', check);
  // A restored page may have an outdated receipt result. Recheck only locked
  // setup, preserving active work and avoiding a second initial-load check.
  target.addEventListener('pageshow', event => { if (event.persisted && !accessGranted) void check(); });
  // Never interrupt a merchant's active local work when connectivity changes.
  target.addEventListener('online', () => { if (!accessGranted) void check(); });
  target.addEventListener('offline', () => {
    if (!accessGranted) { void check(); return; }
    doc.getElementById('installedUseStatus').textContent = 'Offline · Current local workspace remains open. Registration cannot be reverified; keep backups and reconnect before relying on a future offline restart.';
  });
  void check();
}
