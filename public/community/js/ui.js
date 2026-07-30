import { renderAlerts } from './alerts.js';
import { renderCardOptions, renderCardPreviewForCustomer } from './cards.js';
import { renderCrmList, renderCustomerProfile } from './crm.js';
import { appState, getCustomerById, rewardReady } from './state.js';
import { escapeHtml } from './utils.js';

export const screens = [
  { id: 'counter', label: 'Counter' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'customers', label: 'CRM' },
  { id: 'cards', label: 'Cards' },
  { id: 'settings', label: 'Settings & Data' },
  { id: 'help', label: 'Help' },
  { id: 'upgrade', label: 'Upgrade' }
];

const activityLabels = {
  customer_created: 'Customer added',
  customer_deleted: 'Customer deleted',
  visit: 'Visit',
  note: 'Note',
  bonus_points: 'Bonus points',
  reward_redeemed: 'Reward redeemed'
};

export function toast(message, targetId = 'counterNotice', error = false) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.textContent = message;
  target.classList.toggle('error', error);
}

export function setCurrentCustomer(customer) {
  appState.currentCustomerId = customer ? customer.id : null;
  const summary = document.getElementById('currentCustomerSummary');
  if (!customer) {
    summary.className = 'empty-state';
    summary.textContent = 'No customer selected.';
    return;
  }
  const status = rewardReady(customer)
    ? `<strong>Reward ready: ${escapeHtml(appState.branding.rewardName)}</strong>`
    : `${Math.max(0, Number(appState.branding.rewardThreshold) - Number(customer.points || 0))} points until reward`;
  summary.className = '';
  summary.innerHTML = `
    <h3>${escapeHtml(customer.name)}</h3>
    <p>Code: <strong>${escapeHtml(customer.token)}</strong></p>
    <p>${Number(customer.visits || 0)} visits · ${Number(customer.points || 0)} points</p>
    <p>${status}</p>`;
}

export function clearCounterInputs() {
  document.getElementById('scanInput').value = '';
}

export function renderDashboard() {
  document.getElementById('kpiCustomers').textContent = appState.customers.length;
  document.getElementById('kpiVisits').textContent = appState.customers.reduce((sum, customer) => sum + Number(customer.visits || 0), 0);
  document.getElementById('kpiRewardReady').textContent = appState.customers.filter(rewardReady).length;
  document.getElementById('kpiRewardsRedeemed').textContent = appState.customers.reduce((sum, customer) => sum + (customer.redemptions?.length || 0), 0);

  const top = [...appState.customers].sort((a, b) => Number(b.visits || 0) - Number(a.visits || 0)).slice(0, 5);
  document.getElementById('topCustomers').innerHTML = top.length
    ? `<table><thead><tr><th>Name</th><th>Visits</th><th>Points</th></tr></thead><tbody>
       ${top.map(customer => `<tr><td>${escapeHtml(customer.name)}</td><td>${Number(customer.visits || 0)}</td><td>${Number(customer.points || 0)}</td></tr>`).join('')}
       </tbody></table>`
    : '<p class="muted">No customers yet.</p>';

  const recent = appState.activity.slice(0, 8);
  document.getElementById('recentActivity').innerHTML = recent.length
    ? `<ul>${recent.map(activity => {
      const customer = getCustomerById(activity.customerId);
      return `<li><strong>${escapeHtml(activityLabels[activity.type] || activity.type)}</strong> · ${escapeHtml(customer?.name || 'Removed customer')} · ${escapeHtml(activity.details || '')}</li>`;
    }).join('')}</ul>`
    : '<p class="muted">No activity yet.</p>';
  renderAlerts();
}

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  document.getElementById(`screen-${id}`)?.classList.add('active');
  document.querySelectorAll('nav button').forEach(button => {
    button.classList.toggle('active', button.dataset.screen === id);
  });
  if (id === 'dashboard') renderDashboard();
  if (id === 'cards') renderCardPreviewForCustomer();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function buildNav() {
  const nav = document.getElementById('mainNav');
  nav.innerHTML = screens.map(screen => `<button type="button" data-screen="${screen.id}">${screen.label}</button>`).join('');
  nav.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => showScreen(button.dataset.screen));
  });
  nav.querySelector('button')?.classList.add('active');
}

export function renderAll() {
  renderDashboard();
  renderCrmList();
  renderCustomerProfile(getCustomerById(appState.selectedCrmCustomerId));
  renderCardOptions();
  const current = getCustomerById(appState.currentCustomerId);
  setCurrentCustomer(current);
  const selectedCard = document.getElementById('cardCustomer').value || appState.customers[0]?.id;
  if (selectedCard) renderCardPreviewForCustomer(selectedCard);
}
