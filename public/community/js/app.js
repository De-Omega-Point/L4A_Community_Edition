import { createInstallController } from './install-controller.js';
import { mountInstallGuidance } from './install-guidance.js';
import { mountUninstallGuidance } from './uninstall-guidance.js';
import { mountInstallFirst } from './install-first.js';
import { mountRegisteredProduct } from './registered-product.js';
import { observeAppInstallation, recordAcquisitionEvent } from './acquisition.js';
import {
  loadBranding,
  refreshBrandDraftPreview,
  removeBrandLogoDraft,
  saveSettings,
  stageBrandLogoFile
} from './branding.js';
import { batchPrintA4, copyCustomerCode, exportCardPng, printMemberCard, renderCardPreviewForCustomer } from './cards.js';
import { deleteSelectedCustomer, renderCrmList, resetCrmForm, saveCustomerFromForm, selectCrmCustomer } from './crm.js';
import { captureNoteDraft, clearSavedNoteDraft } from './note-drafts.js';
import { addNote, addVisit, handleScan, redeemReward } from './rewards.js';
import { startCameraScanner, stopCameraScanner } from './scanner.js';
import {
  appState,
  findCustomers,
  getCustomerById,
  lastBackupAt,
  loadData,
  markBackupCreated,
  prepareBackup,
  restoreBackup,
  serialisableState,
  waitForPendingChanges
} from './state.js';
import { renderMemberDashboard } from './member-dashboard.js';
import { buildNav, mountLogoHome, clearCounterInputs, renderAll, setCurrentCustomer, showScreen, toast } from './ui.js';
import { csvCell, downloadTextFile, escapeHtml } from './utils.js';
import { MAX_BACKUP_BYTES } from './data-schema.js';

let installGuidance = null;
let installController;

function isInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function hideInstallBanner() {
  document.getElementById('installBanner').hidden = true;
}

function showInstallInstructions() {
  installGuidance?.render();
  const dialog = document.getElementById('installDialog');
  if (!dialog.open) dialog.showModal();
}

function installApp() { return installController?.install(); }

function bindInstallExperience() {
  installController = createInstallController({
    showHelp: showInstallInstructions,
    requested: () => { void recordAcquisitionEvent('install_requested'); },
    installed: hideInstallBanner,
    status: message => {
      for (const id of ['installActionStatus', 'installDialogStatus']) document.getElementById(id).textContent = message;
    },
    render: ({ available, pending, observed }) => {
      installGuidance?.render();
      for (const id of ['btnInstallApp', 'btnInstallFirst', 'btnDialogInstall']) {
        document.getElementById(id).disabled = pending || observed;
      }
      document.getElementById('btnDialogInstall').hidden = !available || observed;
    }
  });
  installGuidance = mountInstallGuidance({ hasPrompt: () => installController.hasPrompt(), actionState: () => installController.actionState() });
  observeAppInstallation(window);
  let dismissed = false;
  try { dismissed = sessionStorage.getItem('l4a.install.dismissed') === '1'; } catch {}
  if (isInstalledApp() || dismissed) hideInstallBanner();
  document.getElementById('btnInstallApp').addEventListener('click', installApp);
  document.getElementById('btnDialogInstall').addEventListener('click', installApp);
  document.getElementById('btnDismissInstall').addEventListener('click', () => {
    try { sessionStorage.setItem('l4a.install.dismissed', '1'); } catch {}
    hideInstallBanner();
  });
  document.getElementById('btnCloseInstallDialog').addEventListener('click', () => document.getElementById('installDialog').close());
}

function backupFilename() {
  const safeName = (appState.branding.businessName || 'loyalty-4-all').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${safeName || 'loyalty-4-all'}-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

function updateBackupStatus() {
  const value = lastBackupAt();
  document.getElementById('lastBackupStatus').textContent = value
    ? `Requested ${new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} — check the saved file`
    : 'Never';
}

export async function exportData() {
  const { warning } = await waitForPendingChanges();
  downloadTextFile(backupFilename(), JSON.stringify(serialisableState()), 'application/json');
  markBackupCreated();
  updateBackupStatus();
  toast(warning ? 'Backup download requested with the last saved records. A recent change failed to save; that change is not included. Check the saved file.' : 'Backup download requested. Check your Downloads or Files app and keep the JSON file somewhere safe. This app cannot confirm that your browser saved it.', 'dataNotice', Boolean(warning));
  return true;
}

async function exportCustomersCsv() {
  const { warning } = await waitForPendingChanges();
  const header = ['Name', 'Customer Code', 'Email', 'Phone', 'Contact Consent', 'Visits', 'Points', 'Tier', 'Created'];
  const rows = appState.customers.map(customer => [
    customer.name,
    customer.token,
    customer.email || '',
    customer.phone || '',
    customer.contactConsent ? 'Yes' : 'No',
    Number(customer.visits || 0),
    Number(customer.points || 0),
    customer.tier || 'Standard',
    customer.createdAt || ''
  ]);
  const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  downloadTextFile('loyalty-4-all-customers.csv', csv, 'text/csv;charset=utf-8');
  toast(warning ? 'CSV download requested with the last saved records. A recent change failed to save; that change is not included. Check the saved file.' : 'CSV download requested. Check your Downloads or Files app; CSV is not a full restorable backup.', 'dataNotice', Boolean(warning));
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('This backup is larger than 20 MB. No records were changed.');
      const parsed = prepareBackup(JSON.parse(await file.text()));
      if (!confirm(`Replace the records on this device with ${parsed.customers.length} customers from this backup? Download your current backup first if you want to keep it.`)) return;
      await restoreBackup(parsed);
      resetCrmForm();
      await loadBranding();
      renderAll();
      toast('Backup restored on this device.', 'dataNotice');
    } catch (error) {
      toast(error instanceof SyntaxError ? 'That file is not valid JSON. No records were changed.' : error.message || 'The backup could not be restored. No records were changed.', 'dataNotice', true);
    }
  };
  input.click();
}

// Disable repeated activation until the entire durable action finishes.
function bindSavedAction(id, action, notice = 'counterNotice') {
  const button = document.getElementById(id);
  let pending = false;
  button.addEventListener('click', async () => {
    if (pending) return;
    pending = true;
    button.disabled = true;
    try { await action(); }
    catch (error) { toast(error.message || 'This change could not be saved. Please try again.', notice, true); }
    finally {
      pending = false;
      button.disabled = false;
      if (id === 'btnCheckIn' || id === 'btnRedeemReward') setCurrentCustomer(getCustomerById(appState.currentCustomerId));
    }
  });
}

async function saveCustomerNote(inputId, customerId, notice) {
  const draft = captureNoteDraft(inputId, customerId);
  const owner = getCustomerById(customerId);
  if (!draft || !owner) return toast('Select a customer and write a note.', notice, true);
  let customer;
  try {
    customer = await addNote(draft.text, draft.customerId);
  } catch (error) {
    return toast(`${owner.name}: note could not be saved. ${error.message || 'Please try again.'}`, notice, true);
  }
  if (!customer) return toast(`${owner.name}: note was not saved. Select the customer and try again.`, notice, true);
  clearSavedNoteDraft(inputId, draft);
  renderAll();
  toast(`${customer.name}: private note saved locally.`, notice);
}

function selectCounterCustomer(customer) {
  if (!customer) return false;
  setCurrentCustomer(customer);
  clearCounterInputs();
  toast(`${customer.name} is ready.`);
  return true;
}

function renderSearchSuggestions(query) {
  const target = document.getElementById('searchSuggestions');
  const matches = findCustomers(query, 5);
  if (!String(query || '').trim() || !matches.length) {
    target.hidden = true;
    target.innerHTML = '';
    return matches;
  }
  target.innerHTML = matches.map(customer => `<button class="suggestion-button" data-cid="${escapeHtml(customer.id)}" type="button"><strong>${escapeHtml(customer.name)}</strong><span>${escapeHtml(customer.token)}</span></button>`).join('');
  target.hidden = false;
  target.querySelectorAll('.suggestion-button').forEach(button => {
    button.addEventListener('click', () => selectCounterCustomer(getCustomerById(button.dataset.cid)));
  });
  return matches;
}

function findFromCounter() {
  const value = document.getElementById('scanInput').value.trim();
  const exact = handleScan(value);
  if (exact) return selectCounterCustomer(exact);
  setCurrentCustomer(null);
  const matches = renderSearchSuggestions(value);
  if (matches.length === 1) return selectCounterCustomer(matches[0]);
  if (!matches.length) toast('No customer matched. Check the code or add a customer.', 'counterNotice', true);
  else toast('Choose the matching customer below.');
  return false;
}

function openNewCustomer() {
  stopCameraScanner();
  showScreen('customers');
  resetCrmForm();
  window.setTimeout(() => document.getElementById('crmName').focus(), 120);
}

function announceSurprise(customer, award) {
  if (!award) return;
  document.getElementById('rewardDialogMessage').textContent = `${customer.name} unlocked: ${award.description}`;
  const dialog = document.getElementById('rewardDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  navigator.vibrate?.([90, 50, 140]);
  if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(`Surprise reward. ${customer.name} has won ${award.description}.`));
  }
}

async function updateStorageProtection() {
  if (!navigator.storage?.persisted) return;
  try {
    let protectedStorage = await navigator.storage.persisted();
    if (!protectedStorage && navigator.storage.persist) protectedStorage = await navigator.storage.persist();
    document.getElementById('storageBadge').textContent = protectedStorage ? 'Protected locally' : 'This device';
  } catch {}
}

function bindEvents() {
  mountLogoHome();
  document.getElementById('btnMemberRewardSettings').addEventListener('click', () => showScreen('settings'));
  document.getElementById('memberFilter').addEventListener('change', renderMemberDashboard);
  document.getElementById('memberSearch').addEventListener('input', renderMemberDashboard);
  ['btnExploreIntelligence', 'btnSettingsJoin'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => showScreen('intelligence'));
  });

  document.getElementById('btnHandleScan').addEventListener('click', findFromCounter);
  document.getElementById('scanInput').addEventListener('input', event => {
    setCurrentCustomer(null);
    renderSearchSuggestions(event.target.value);
  });
  document.getElementById('scanInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') findFromCounter();
  });

  document.getElementById('btnCameraScan').addEventListener('click', async () => {
    setCurrentCustomer(null);
    const result = await startCameraScanner();
    if (result.reason === 'cancelled') return;
    toast(result.ok ? 'Camera ready. Point it at the QR code.' : 'Camera unavailable. Enter the code or customer name.', 'counterNotice', !result.ok);
  });
  document.getElementById('btnStopCameraScan').addEventListener('click', () => {
    stopCameraScanner();
    toast('Camera stopped.');
  });
  window.addEventListener('lfa:customer-scanned', event => selectCounterCustomer(getCustomerById(event.detail.customerId)));
  window.addEventListener('lfa:quick-customer', event => {
    if (selectCounterCustomer(getCustomerById(event.detail.customerId))) showScreen('counter');
  });
  window.addEventListener('lfa:screen-changed', event => {
    if (event.detail.screen !== 'counter') stopCameraScanner();
  });

  bindSavedAction('btnCheckIn', async () => {
    const customerId = appState.currentCustomerId;
    const result = await addVisit(customerId);
    if (!result) return toast('Select a customer first.', 'counterNotice', true);
    renderAll();
    if (appState.currentCustomerId === customerId) clearCounterInputs();
    toast(`${result.customer.name}: ${result.surpriseAward ? 'visit recorded, surprise reward unlocked!' : 'visit recorded.'}`);
    announceSurprise(result.customer, result.surpriseAward);
  });
  bindSavedAction('btnRedeemReward', async () => {
    const result = await redeemReward();
    if (!result) return toast('No reward is ready for this customer.', 'counterNotice', true);
    renderAll();
    toast(`${result.customer.name}: ${result.description} marked as given.`);
  });
  document.getElementById('btnClearCustomer').addEventListener('click', () => {
    setCurrentCustomer(null);
    clearCounterInputs();
    toast('Ready for the next customer.');
  });
  bindSavedAction('btnAddNote', () => saveCustomerNote('counterNote', appState.currentCustomerId, 'counterNotice'));

  ['btnNewCustomer', 'btnOpenNewCustomer'].forEach(id => document.getElementById(id).addEventListener('click', openNewCustomer));
  document.getElementById('btnViewCustomers').addEventListener('click', () => showScreen('customers'));
  bindSavedAction('btnSaveCustomer', async () => {
    const selectedId = appState.selectedCrmCustomerId;
    const formRevision = appState.crmFormRevision;
    const formValue = () => ['crmName', 'crmToken', 'crmEmail', 'crmPhone'].map(id => document.getElementById(id).value).join('\u0000') + document.getElementById('crmContactConsent').checked;
    const originalForm = formValue();
    const result = await saveCustomerFromForm();
    if (result.error) return toast(result.error, 'customerFormNotice', true);
    renderAll();
    if (appState.selectedCrmCustomerId === selectedId && appState.crmFormRevision === formRevision && formValue() === originalForm) {
      setCurrentCustomer(result.customer);
      selectCrmCustomer(result.customer.id);
      renderCardPreviewForCustomer(result.customer.id);
    }
    toast(`${result.customer.name} saved on this device.`, 'customerFormNotice');
  }, 'customerFormNotice');
  bindSavedAction('btnDeleteCustomer', async () => {
    const customer = getCustomerById(appState.selectedCrmCustomerId);
    if (!customer) return toast('Select a customer first.', 'customerFormNotice', true);
    if (!confirm(`Delete ${customer.name} and their local history?`)) return;
    const formRevision = appState.crmFormRevision;
    const removed = await deleteSelectedCustomer();
    if (removed) {
      if (appState.crmFormRevision === formRevision && !appState.selectedCrmCustomerId) resetCrmForm();
      renderAll();
      toast(`${removed.name} deleted from this device.`, 'customerFormNotice');
    }
  }, 'customerFormNotice');
  document.getElementById('btnResetCustomer').addEventListener('click', resetCrmForm);
  document.getElementById('crmSearch').addEventListener('input', renderCrmList);
  document.querySelectorAll('.filter-chip').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(candidate => candidate.classList.toggle('active', candidate === button));
      document.getElementById('crmSegmentFilter').value = button.dataset.segment;
      renderCrmList();
    });
  });
  window.addEventListener('lfa:crm-customer-selected', event => {
    if (event.detail.customerId) renderCardPreviewForCustomer(event.detail.customerId);
  });

  document.getElementById('btnExportCardPng').addEventListener('click', async () => {
    if (!await exportCardPng()) toast('Select a customer first.', 'customerFormNotice', true);
  });
  document.getElementById('btnCopyCode').addEventListener('click', async () => {
    const copied = await copyCustomerCode();
    toast(copied ? 'Customer code copied.' : 'Could not copy the code on this browser.', 'customerFormNotice', !copied);
  });
  document.getElementById('btnPrintCard').addEventListener('click', () => {
    if (!printMemberCard(appState.selectedCrmCustomerId)) toast('Select a customer and wait for the page to finish loading before printing.', 'customerFormNotice', true);
  });
  document.getElementById('btnPrintVisitCard').addEventListener('click', () => {
    if (!printMemberCard(appState.currentCustomerId)) toast('Select a customer and wait for the page to finish loading before printing.', 'counterNotice', true);
  });
  bindSavedAction('btnAddProfileNote', () => saveCustomerNote('profileNote', appState.selectedCrmCustomerId, 'customerFormNotice'), 'customerFormNotice');

  document.getElementById('settingsBrandColour').addEventListener('input', event => {
    document.documentElement.style.setProperty('--brand-colour', event.target.value);
  });
  document.getElementById('settingsBusinessName').addEventListener('input', refreshBrandDraftPreview);
  document.getElementById('settingsBrandLogoFile').addEventListener('change', async event => {
    const notice = document.getElementById('brandLogoNotice');
    notice.hidden = false;
    try {
      toast(await stageBrandLogoFile(event.target.files?.[0]), 'brandLogoNotice');
    } catch (error) {
      toast(error.message || 'That logo could not be prepared.', 'brandLogoNotice', true);
    } finally {
      event.target.value = '';
    }
  });
  document.getElementById('btnRemoveBrandLogo').addEventListener('click', () => {
    removeBrandLogoDraft();
    const notice = document.getElementById('brandLogoNotice');
    notice.hidden = false;
    toast('Logo removed from the preview. Save settings to confirm.', 'brandLogoNotice');
  });
  bindSavedAction('btnSaveSettings', async () => {
    await saveSettings();
    renderAll();
    toast('Business and reward settings saved on this device.', 'dataNotice');
  }, 'dataNotice');
  bindSavedAction('btnExportData', exportData, 'dataNotice');
  bindSavedAction('btnExportCsv', exportCustomersCsv, 'dataNotice');
  document.getElementById('btnImportData').addEventListener('click', importData);
  document.getElementById('btnBatchPrintA4').addEventListener('click', () => {
    if (!batchPrintA4()) toast('Add at least one customer first.', 'dataNotice', true);
  });
  document.getElementById('btnCloseRewardDialog').addEventListener('click', () => document.getElementById('rewardDialog').close());

  window.addEventListener('pagehide', stopCameraScanner);
  window.addEventListener('beforeunload', stopCameraScanner);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCameraScanner();
    else renderMemberDashboard();
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

async function init() {
  mountUninstallGuidance();
  registerServiceWorker();
  bindInstallExperience();
  await loadData();
  await loadBranding();
  buildNav();
  bindEvents();
  updateBackupStatus();
  updateStorageProtection();
  renderAll();
  if (appState.storageWarning) {
    toast(appState.storageWarning, 'counterNotice', true);
    toast(appState.storageWarning, 'dataNotice', true);
  }
  mountRegisteredProduct();
  mountInstallFirst({
    hasExistingRecords: appState.customers.length > 0 || appState.activity.length > 0,
    storageWarning: appState.storageWarning,
    exportBackup: exportData, exportCsv: exportCustomersCsv, install: installApp
  });
  void recordAcquisitionEvent('app_opened');
}

void init().catch(error => {
  const message = error.message || 'The app could not open local storage.';
  document.getElementById('installFirstMessage').textContent = message + ' Existing storage has not been cleared. Do not clear website data; contact support if reopening does not help.';
  toast(message, 'counterNotice', true);
});
