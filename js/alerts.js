import { appState, rewardReady } from './state.js';
import { escapeHtml } from './utils.js';

export function generateAlerts() {
  const now = Date.now();
  return appState.customers.flatMap(customer => {
    const alerts = [];
    const lastAt = customer.lastInteractionAt ? new Date(customer.lastInteractionAt).getTime() : null;
    if (rewardReady(customer)) {
      alerts.push({ type: 'reward_ready', customerId: customer.id, text: `${customer.name} has a reward ready.` });
    }
    if (lastAt && (now - lastAt) / 86400000 > 45) {
      alerts.push({ type: 'inactive', customerId: customer.id, text: `${customer.name} has not visited for more than 45 days.` });
    }
    return alerts;
  });
}

export function renderAlerts() {
  const alerts = generateAlerts().slice(0, 10);
  document.getElementById('alertsPanel').innerHTML = alerts.length
    ? alerts.map(alert => `<div class="alert-pill">${escapeHtml(alert.text)}</div>`).join('')
    : '<p class="muted">Nothing needs attention right now.</p>';
  return alerts;
}
