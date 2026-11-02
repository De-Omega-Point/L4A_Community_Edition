import { renderMemberDashboard } from './member-dashboard.js';
import { renderCardPreviewForCustomer } from './cards.js';
import { renderCrmList, renderCustomerProfile, renderCustomerTimeline } from './crm.js';
import { setNoteDraftCustomer } from './note-drafts.js';
import { appState, getCustomerById, pendingSurpriseReward, rewardReady, standardRewardReady } from './state.js';
import { escapeHtml } from './utils.js';

export const screens = [
  { id: 'counter', label: 'Counter' },
  { id: 'customers', label: 'Customers' },
  { id: 'members', label: 'Members' },
  { id: 'intelligence', label: 'Insights' },
  { id: 'settings', label: 'Settings' }
];

export function toast(message, targetId = 'counterNotice', error = false) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.textContent = message;
  target.classList.toggle('error', error);
}

export function setCurrentCustomer(customer) {
  appState.currentCustomerId = customer ? customer.id : null;
  setNoteDraftCustomer('counterNote', customer);
  const summary = document.getElementById('currentCustomerSummary');
  const checkInButton = document.getElementById('btnCheckIn');
  const redeemButton = document.getElementById('btnRedeemReward');
  const clearButton = document.getElementById('btnClearCustomer');

  if (!customer) {
    summary.className = 'empty-state';
    summary.innerHTML = '<strong>No customer selected</strong><span>Scan a QR code or find a customer by name.</span>';
    checkInButton.disabled = true;
    redeemButton.hidden = true;
    clearButton.hidden = true;
    return;
  }

  const threshold = Math.max(1, Number(appState.branding.rewardThreshold || 10));
  const points = Number(customer.points || 0);
  const visits = Number(customer.visits || 0);
  const progress = Math.min(100, Math.round((Math.min(points, threshold) / threshold) * 100));
  const surprise = pendingSurpriseReward(customer);
  const pointsRemaining = Math.max(0, threshold - points);
  const rewardLabel = surprise
    ? `Surprise ready: ${escapeHtml(surprise.description)}`
    : standardRewardReady(customer)
      ? `Ready: ${escapeHtml(appState.branding.rewardName)}`
      : `${pointsRemaining} ${pointsRemaining === 1 ? 'point' : 'points'} to reward`;

  summary.className = 'customer-summary';
  summary.innerHTML = `
    <div class="customer-summary-top">
      <div><h4>${escapeHtml(customer.name)}</h4><p class="customer-code">${escapeHtml(customer.token)}</p></div>
      <span class="status-pill${rewardReady(customer) ? ' reward-ready-label' : ''}">${rewardReady(customer) ? 'Reward ready' : `${visits} ${visits === 1 ? 'visit' : 'visits'}`}</span>
    </div>
    <div class="progress-copy"><span>${points} ${points === 1 ? 'point' : 'points'}</span><strong>${rewardLabel}</strong></div>
    <div class="progress-track" role="progressbar" aria-label="Reward progress" aria-valuemin="0" aria-valuemax="${threshold}" aria-valuenow="${Math.min(points, threshold)}">
      <div class="progress-fill" style="width:${progress}%"></div>
    </div>`;

  checkInButton.disabled = false;
  checkInButton.textContent = `Record Visit (+${Number(appState.branding.pointsPerVisit || 1)})`;
  redeemButton.hidden = !rewardReady(customer);
  redeemButton.textContent = surprise ? `Give ${surprise.description}` : `Give ${appState.branding.rewardName}`;
  clearButton.hidden = false;
}

export function clearCounterInputs() {
  document.getElementById('scanInput').value = '';
  document.getElementById('searchSuggestions').hidden = true;
}

function renderCounterStats() {
  document.getElementById('kpiCustomers').textContent = appState.customers.length;
  document.getElementById('kpiVisits').textContent = appState.customers.reduce((sum, customer) => sum + Number(customer.visits || 0), 0);
  document.getElementById('kpiRewardReady').textContent = appState.customers.filter(rewardReady).length;
}

function renderRecentCustomers() {
  const recent = [...appState.customers]
    .sort((a, b) => new Date(b.lastInteractionAt || b.createdAt || 0) - new Date(a.lastInteractionAt || a.createdAt || 0))
    .slice(0, 4);
  const target = document.getElementById('recentCustomers');
  target.innerHTML = recent.length
    ? recent.map(customer => {
      const visits = Number(customer.visits || 0);
      const points = Number(customer.points || 0);
      return `<button class="recent-customer" data-cid="${escapeHtml(customer.id)}" type="button"><strong>${escapeHtml(customer.name)}</strong><span>${visits} ${visits === 1 ? 'visit' : 'visits'} · ${points} ${points === 1 ? 'point' : 'points'}</span></button>`;
    }).join('')
    : '<div class="empty-state"><strong>No customers yet</strong><span>Add your first customer to begin.</span></div>';
  target.querySelectorAll('.recent-customer').forEach(button => {
    button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('lfa:quick-customer', { detail: { customerId: button.dataset.cid } })));
  });
}

export function showScreen(id) {
  if (id === 'members') renderMemberDashboard();
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  document.getElementById(`screen-${id}`)?.classList.add('active');
  document.querySelectorAll('nav button').forEach(button => {
    button.classList.toggle('active', button.dataset.screen === id);
    if (button.dataset.screen === id) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  window.dispatchEvent(new CustomEvent('lfa:screen-changed', { detail: { screen: id } }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function buildNav() {
  const nav = document.getElementById('mainNav');
  nav.innerHTML = screens.map(screen => `<button type="button" data-screen="${screen.id}">${screen.label}</button>`).join('');
  nav.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => showScreen(button.dataset.screen));
  });
  nav.querySelector('[data-screen="counter"]')?.classList.add('active');
}

export function renderAll() {
  renderMemberDashboard();
  renderCounterStats();
  renderRecentCustomers();
  renderCrmList();
  const selected = getCustomerById(appState.selectedCrmCustomerId);
  renderCustomerProfile(selected);
  renderCustomerTimeline(selected);
  if (selected) renderCardPreviewForCustomer(selected.id);
  setCurrentCustomer(getCustomerById(appState.currentCustomerId));
}

// Keep Home inside the current workspace: no reload, lost drafts, or setup bypass.
export function mountLogoHome({ doc = document, navigate = showScreen } = {}) {
  doc.getElementById('logoHome')?.addEventListener('click', event => {
    if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const tools = doc.getElementById('customerTools');
    if (!tools || tools.hidden || tools.inert) {
      doc.getElementById('installFirstTitle')?.focus();
      return;
    }
    navigate('counter');
    doc.getElementById('counterTitle')?.focus({ preventScroll: true });
  });
}
