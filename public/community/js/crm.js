import { addActivity, appState, customerTierForPoints, getCustomerById, rewardReady, saveData } from './state.js';
import { escapeHtml, nowIso, uid } from './utils.js';

const DAY_MS = 86400000;

function customerCode() {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `CUST-${Array.from(bytes, value => alphabet[value % alphabet.length]).join('')}`;
}

function lastVisitAt(customer) {
  return appState.activity.find(activity =>
    activity.customerId === customer.id && activity.type === 'visit'
  )?.at || null;
}

function daysSince(isoDate) {
  if (!isoDate) return null;
  const time = new Date(isoDate).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
}

export function crmStatus(customer) {
  if (Number(customer.visits || 0) === 0) return { key: 'new', label: 'New' };
  const elapsed = daysSince(lastVisitAt(customer));
  if (elapsed === null || elapsed > 45) return { key: 'follow-up', label: 'Follow-up' };
  if (elapsed > 30) return { key: 'cooling', label: 'Cooling' };
  return { key: 'active', label: 'Active' };
}

function isVip(customer) {
  return Number(customer.visits || 0) >= 10;
}

function relativeVisit(customer) {
  const elapsed = daysSince(lastVisitAt(customer));
  if (elapsed === null) return 'No visits yet';
  if (elapsed === 0) return 'Today';
  if (elapsed === 1) return 'Yesterday';
  return `${elapsed} days ago`;
}

function matchesSegment(customer, segment) {
  if (segment === 'active') return crmStatus(customer).key === 'active';
  if (segment === 'follow-up') return crmStatus(customer).key === 'follow-up';
  if (segment === 'reward-ready') return rewardReady(customer);
  if (segment === 'vip') return isVip(customer);
  if (segment === 'contactable') return Boolean(customer.contactConsent && (customer.email || customer.phone));
  return true;
}

function renderCrmSummary() {
  document.getElementById('crmTotal').textContent = appState.customers.length;
  document.getElementById('crmActive').textContent = appState.customers.filter(customer => crmStatus(customer).key === 'active').length;
  document.getElementById('crmFollowUp').textContent = appState.customers.filter(customer => crmStatus(customer).key === 'follow-up').length;
  document.getElementById('crmVip').textContent = appState.customers.filter(isVip).length;
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
  document.getElementById('crmProfile').className = 'empty-state';
  document.getElementById('crmProfile').textContent = 'Select a customer to view their CRM profile.';
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
  const segment = document.getElementById('crmSegmentFilter').value;
  renderCrmSummary();
  const filtered = appState.customers
    .filter(customer =>
      `${customer.name} ${customer.token} ${customer.email || ''} ${customer.phone || ''}`.toLowerCase().includes(query)
    )
    .filter(customer => matchesSegment(customer, segment))
    .sort((a, b) => {
      const priority = { 'follow-up': 0, cooling: 1, active: 2, new: 3 };
      return priority[crmStatus(a).key] - priority[crmStatus(b).key]
        || Number(b.visits || 0) - Number(a.visits || 0);
    });

  document.getElementById('crmList').innerHTML = filtered.length
    ? `<table>
        <thead><tr><th>Name</th><th>Status</th><th>Last visit</th><th>Visits</th><th>Reward</th></tr></thead>
        <tbody>${filtered.map(customer => `
          <tr class="crm-row" data-cid="${customer.id}" tabindex="0" role="button" aria-label="Open ${escapeHtml(customer.name)} CRM profile">
            <td>${escapeHtml(customer.name)}</td>
            <td><span class="crm-status ${crmStatus(customer).key}">${crmStatus(customer).label}</span></td>
            <td>${relativeVisit(customer)}</td>
            <td>${Number(customer.visits || 0)}</td>
            <td>${rewardReady(customer) ? 'Ready' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : '<p class="empty-state">No customers match this CRM view.</p>';

  document.querySelectorAll('.crm-row').forEach(row => {
    const openProfile = () => {
      appState.selectedCrmCustomerId = row.dataset.cid;
      const customer = getCustomerById(row.dataset.cid);
      populateCrmForm(customer);
      renderCustomerProfile(customer);
      renderCustomerTimeline(customer);
    };
    row.addEventListener('click', openProfile);
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProfile();
      }
    });
  });
}

export function renderCustomerProfile(customer) {
  const target = document.getElementById('crmProfile');
  if (!customer) {
    target.className = 'empty-state';
    target.textContent = 'Select a customer to view their CRM profile.';
    return;
  }
  const status = crmStatus(customer);
  const joined = customer.createdAt
    ? new Date(customer.createdAt).toLocaleDateString('en-AU')
    : 'Unknown';
  const contact = customer.contactConsent && (customer.email || customer.phone)
    ? 'Permission recorded'
    : 'No contact permission';
  target.className = '';
  target.innerHTML = `
    <div class="crm-profile-grid">
      <div><span>Relationship status</span><strong><span class="crm-status ${status.key}">${status.label}</span></strong></div>
      <div><span>Customer segment</span><strong>${isVip(customer) ? 'VIP' : Number(customer.visits || 0) >= 5 ? 'Regular' : 'Standard'}</strong></div>
      <div><span>Last visit</span><strong>${relativeVisit(customer)}</strong></div>
      <div><span>Total visits</span><strong>${Number(customer.visits || 0)}</strong></div>
      <div><span>Points</span><strong>${Number(customer.points || 0)}</strong></div>
      <div><span>Reward</span><strong>${rewardReady(customer) ? `Ready: ${escapeHtml(appState.branding.rewardName)}` : 'Not ready'}</strong></div>
      <div><span>Contact</span><strong>${contact}</strong></div>
      <div><span>Customer since</span><strong>${joined}</strong></div>
    </div>`;
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
