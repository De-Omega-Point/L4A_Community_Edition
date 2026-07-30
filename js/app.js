import { batchPrintA4, emailCardImage, exportCardPng, renderCardPreviewForCustomer } from './cards.js';
import { deleteSelectedCustomer, renderCrmList, resetCrmForm, saveCustomerFromForm } from './crm.js';
import { applyBranding, loadBranding, saveBranding, saveRewardSettings } from './branding.js';
import { addBonusPoints, addNote, addVisit, handleScan, redeemReward } from './rewards.js';
import { startCameraScanner, stopCameraScanner } from './scanner.js';
import {
  appState,
  clearDemoData,
  getCustomerById,
  loadData,
  loadDemoData,
  saveData,
  serialisableState,
  storageKeys
} from './state.js';
import { buildNav, clearCounterInputs, renderAll, setCurrentCustomer, showScreen, toast } from './ui.js';
import { applyRegistrationToUi, feedbackUrl, loadRegistration, submitRegistration } from './registration.js';
import { downloadTextFile, escapeHtml } from './utils.js';

let registration = loadRegistration();

function backupFilename() {
  const safeName = (appState.branding.businessName || 'loyalty-for-all').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${safeName || 'loyalty-for-all'}-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

export function exportData() {
  downloadTextFile(backupFilename(), JSON.stringify(serialisableState(), null, 2), 'application/json');
  toast('Backup downloaded. Store it somewhere safe.', 'dataNotice');
  return true;
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCustomersCsv() {
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
  downloadTextFile('loyalty-for-all-customers.csv', csv, 'text/csv;charset=utf-8');
  toast('Customer CSV exported.', 'dataNotice');
}

function validBackup(parsed) {
  return parsed
    && Array.isArray(parsed.customers)
    && Array.isArray(parsed.activity)
    && parsed.customers.every(customer => customer && typeof customer.id === 'string' && typeof customer.name === 'string' && typeof customer.token === 'string');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const normalised = parsed.data && !parsed.customers
        ? { customers: parsed.data, activity: parsed.activity || [], branding: parsed.branding }
        : parsed;
      if (!validBackup(normalised)) throw new Error('Invalid backup');
      appState.customers = normalised.customers;
      appState.activity = normalised.activity;
      appState.demoMode = false;
      if (normalised.branding && typeof normalised.branding === 'object') {
        appState.branding = { ...appState.branding, ...normalised.branding };
        localStorage.setItem(storageKeys.branding, JSON.stringify(appState.branding));
        applyBranding();
      }
      saveData();
      renderAll();
      toast('Backup restored successfully.', 'dataNotice');
    } catch {
      toast('That file is not a valid Loyalty for All backup.', 'dataNotice', true);
    }
  };
  input.click();
}

function updateFeedbackLink() {
  const link = document.getElementById('feedbackLink');
  const url = feedbackUrl(registration);
  if (!url) {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    link.textContent = 'Feedback Form Coming Soon';
    link.addEventListener('click', event => event.preventDefault(), { once: true });
    return;
  }
  link.href = url;
}

function bindEvents() {
  document.getElementById('btnHandleScan').addEventListener('click', () => {
    const customer = handleScan();
    if (!customer) return toast('No customer matched that code.', 'counterNotice', true);
    setCurrentCustomer(customer);
    toast(`Ready for ${customer.name}.`);
  });

  document.getElementById('scanInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') document.getElementById('btnHandleScan').click();
  });

  document.getElementById('btnCameraScan').addEventListener('click', async () => {
    const result = await startCameraScanner();
    toast(result.ok ? 'Camera connected.' : 'Camera unavailable. Use the customer code instead.', 'counterNotice', !result.ok);
  });
  document.getElementById('btnStopCameraScan').addEventListener('click', () => {
    stopCameraScanner();
    toast('Camera stopped.');
  });

  window.addEventListener('lfa:customer-scanned', event => {
    const customer = getCustomerById(event.detail.customerId);
    if (customer) {
      setCurrentCustomer(customer);
      toast(`Scanned ${customer.name}.`);
    }
  });

  document.getElementById('btnCheckIn').addEventListener('click', () => {
    const customer = addVisit();
    if (!customer) return toast('Select a customer first.', 'counterNotice', true);
    renderAll();
    setCurrentCustomer(customer);
    clearCounterInputs();
    toast('Visit recorded.');
  });
  document.getElementById('btnManualReward').addEventListener('click', () => {
    const customer = addBonusPoints();
    if (!customer) return toast('Select a customer and enter valid bonus points.', 'counterNotice', true);
    renderAll();
    setCurrentCustomer(customer);
    toast('Bonus points added.');
  });
  document.getElementById('btnRedeemReward').addEventListener('click', () => {
    const customer = redeemReward();
    if (!customer) return toast('This customer does not have a reward ready.', 'counterNotice', true);
    renderAll();
    setCurrentCustomer(customer);
    toast(`${appState.branding.rewardName} redeemed.`);
  });
  document.getElementById('btnAddNote').addEventListener('click', () => {
    const customer = addNote();
    if (!customer) return toast('Select a customer and write a note.', 'counterNotice', true);
    document.getElementById('counterNote').value = '';
    renderAll();
    toast('Note saved.');
  });

  document.getElementById('btnSaveCustomer').addEventListener('click', () => {
    const customer = saveCustomerFromForm();
    if (!customer) return toast('Customer name is required.', 'counterNotice', true);
    renderAll();
    setCurrentCustomer(customer);
    toast(`${customer.name} saved.`);
  });
  document.getElementById('btnDeleteCustomer').addEventListener('click', () => {
    if (!appState.selectedCrmCustomerId) return toast('Select a customer first.', 'counterNotice', true);
    if (!confirm('Delete this customer and their local history?')) return;
    if (deleteSelectedCustomer()) {
      renderAll();
      toast('Customer deleted.');
    }
  });
  document.getElementById('btnResetCustomer').addEventListener('click', resetCrmForm);
  document.getElementById('crmSearch').addEventListener('input', renderCrmList);

  document.getElementById('cardCustomer').addEventListener('change', event => renderCardPreviewForCustomer(event.target.value));
  document.getElementById('btnRenderCard').addEventListener('click', () => renderCardPreviewForCustomer());
  document.getElementById('btnExportCardPng').addEventListener('click', () => {
    if (!exportCardPng()) toast('Add and select a customer first.', 'counterNotice', true);
  });
  document.getElementById('btnPrintCard').addEventListener('click', () => window.print());
  document.getElementById('btnEmailCard').addEventListener('click', () => {
    if (!emailCardImage()) toast('Customer email and contact permission are required.', 'counterNotice', true);
  });
  document.getElementById('btnBatchPrintA4').addEventListener('click', () => {
    if (!batchPrintA4()) toast('Add at least one customer first.', 'counterNotice', true);
  });

  document.getElementById('btnSaveBranding').addEventListener('click', () => {
    saveBranding();
    renderAll();
    toast('Branding saved.', 'dataNotice');
  });
  document.getElementById('settingsBrandColour').addEventListener('input', event => {
    document.documentElement.style.setProperty('--brand-colour', event.target.value);
  });
  document.getElementById('btnSaveRewards').addEventListener('click', () => {
    saveRewardSettings();
    renderAll();
    toast('Reward settings saved.', 'dataNotice');
  });
  document.getElementById('btnExportData').addEventListener('click', exportData);
  document.getElementById('btnHelpBackup').addEventListener('click', exportData);
  document.getElementById('btnExportCsv').addEventListener('click', exportCustomersCsv);
  document.getElementById('btnImportData').addEventListener('click', importData);
  document.getElementById('btnLoadDemo').addEventListener('click', () => {
    if (appState.customers.length && !confirm('Demo mode temporarily replaces the current view. A local restore point will be created. Continue?')) return;
    loadDemoData();
    renderAll();
    showScreen('dashboard');
    toast('Demo data loaded. Your previous local data can be restored.', 'dataNotice');
  });
  document.getElementById('btnClearDemo').addEventListener('click', () => {
    clearDemoData();
    localStorage.setItem(storageKeys.branding, JSON.stringify(appState.branding));
    applyBranding();
    renderAll();
    toast('Demo removed and previous local data restored.', 'dataNotice');
  });

  window.addEventListener('beforeunload', stopCameraScanner);
}

function showApp() {
  document.getElementById('registrationGate').hidden = true;
  document.getElementById('appShell').hidden = false;
  applyRegistrationToUi(registration);
  buildNav();
  loadData();
  loadBranding(registration.businessName);
  bindEvents();
  updateFeedbackLink();
  renderAll();
}

function bindRegistration() {
  const form = document.getElementById('registrationForm');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const notice = document.getElementById('registrationNotice');
    button.disabled = true;
    notice.classList.remove('error');
    notice.textContent = 'Creating your permanent Product ID…';
    try {
      registration = await submitRegistration(form);
      notice.innerHTML = `Your Product ID is <strong>${escapeHtml(registration.productId)}</strong>.`;
      setTimeout(showApp, 650);
    } catch (error) {
      notice.textContent = error.message;
      notice.classList.add('error');
      button.disabled = false;
    }
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

function init() {
  registerServiceWorker();
  if (registration) showApp();
  else bindRegistration();
}

init();
