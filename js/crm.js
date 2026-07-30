import { addActivity, appState, customerTierForPoints, getCustomerById, rewardReady, saveData } from './state.js';
import { escapeHtml, nowIso, uid } from './utils.js';

function customerCode() {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `CUST-${Array.from(bytes, value => alphabet[value % alphabet.length]).join('')}`;
}

export function populateCrmForm(customer) {
  if (!customer) return;
  document.getElementById('crmName').value = customer.name || '';
  document.getElementById('crmToken').value = customer.token || '';
  document.getElementById('crmEmail').value = customer.email || '';
  document.getElementById('crmPhone').value = customer.phone || '';
  document.getElementById('crmContactConsent').checked = Boolean(customer.contactConsent);
}

export function resetCrmForm() {
  appState.selectedCrmCustomerId = null;
  ['crmName', 'crmToken', 'crmEmail', 'crmPhone'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('crmContactConsent').checked = false;
  document.getElementById('crmTimeline').textContent = 'Select a customer to view their history.';
}

export function saveCustomerFromForm() {
  const name = document.getElementById('crmName').value.trim();
  if (!name) return false;

  let customer = getCustomerById(appState.selectedCrmCustomerId);
  if (!customer) {
    customer = {
      id: uid('cust'),
      token: document.getElementById('crmToken').value.trim() || customerCode(),
      visits: 0,
      points: 0,
      tier: 'Standard',
      notes: [],
      redemptions: [],
      createdAt: nowIso()
    };
    appState.customers.push(customer);
    addActivity('customer_created', customer.id, 'Customer added');
  }

  customer.name = name;
  customer.token = document.getElementById('crmToken').value.trim() || customer.token;
  customer.email = document.getElementById('crmEmail').value.trim();
  customer.phone = document.getElementById('crmPhone').value.trim();
  customer.contactConsent = document.getElementById('crmContactConsent').checked;
  customer.tier = customerTierForPoints(Number(customer.points || 0));
  customer.lastInteractionAt = customer.lastInteractionAt || nowIso();
  appState.selectedCrmCustomerId = customer.id;
  saveData();
  return customer;
}

export function deleteSelectedCustomer() {
  if (!appState.selectedCrmCustomerId) return false;
  const index = appState.customers.findIndex(customer => customer.id === appState.selectedCrmCustomerId);
  if (index < 0) return false;
  const [removed] = appState.customers.splice(index, 1);
  addActivity('customer_deleted', removed.id, 'Customer deleted');
  if (appState.currentCustomerId === removed.id) appState.currentCustomerId = null;
  saveData();
  resetCrmForm();
  return true;
}

export function renderCrmList() {
  const query = document.getElementById('crmSearch').value.trim().toLowerCase();
  const filtered = appState.customers.filter(customer =>
    `${customer.name} ${customer.token} ${customer.email || ''} ${customer.phone || ''}`.toLowerCase().includes(query)
  );

  document.getElementById('crmList').innerHTML = filtered.length
    ? `<table>
        <thead><tr><th>Name</th><th>Visits</th><th>Points</th><th>Reward</th></tr></thead>
        <tbody>${filtered.map(customer => `
          <tr class="crm-row" data-cid="${customer.id}">
            <td>${escapeHtml(customer.name)}</td>
            <td>${Number(customer.visits || 0)}</td>
            <td>${Number(customer.points || 0)}</td>
            <td>${rewardReady(customer) ? 'Ready' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : '<p class="empty-state">No customers yet.</p>';

  document.querySelectorAll('.crm-row').forEach(row => {
    row.addEventListener('click', () => {
      appState.selectedCrmCustomerId = row.dataset.cid;
      const customer = getCustomerById(row.dataset.cid);
      populateCrmForm(customer);
      renderCustomerTimeline(customer);
    });
  });
}

export function renderCustomerTimeline(customer) {
  if (!customer) {
    document.getElementById('crmTimeline').textContent = 'Select a customer to view their history.';
    return;
  }
  const timeline = appState.activity.filter(activity => activity.customerId === customer.id).slice(0, 15);
  document.getElementById('crmTimeline').innerHTML = timeline.length
    ? `<ul>${timeline.map(item => `
        <li><strong>${escapeHtml(item.type.replaceAll('_', ' '))}</strong>: ${escapeHtml(item.details || '')}
        <span class="muted">(${new Date(item.at).toLocaleString('en-AU')})</span></li>`).join('')}</ul>`
    : '<span class="muted">No history yet.</span>';
}
