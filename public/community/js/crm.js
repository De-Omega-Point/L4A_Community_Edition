import { addActivity, appState, customerTierForPoints, getCustomerById, rewardReady, updateState } from './state.js';
import { escapeHtml, nowIso, uid } from './utils.js';
import { setNoteDraftCustomer } from './note-drafts.js';

const DAY_MS = 86400000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function customerCode(customers = appState.customers) {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const code = `CUST-${Array.from(bytes, value => alphabet[value % alphabet.length]).join('')}`;
    if (!customers.some(customer => normaliseToken(customer.token) === code)) return code;
  }
  const base = `CUST-${Date.now().toString(36).toUpperCase()}`;
  const used = new Set(customers.map(customer => normaliseToken(customer.token)));
  let code = base;
  for (let suffix = 1; used.has(code); suffix += 1) code = `${base}-${suffix}`;
  return code;
}

export function lastVisitAt(customer, activity = appState.activity) {
  return customer.lastVisitAt || activity.find(entry => entry.customerId === customer.id && entry.type === 'visit')?.at || null;
}

function daysSince(isoDate, now = Date.now()) {
  if (!isoDate) return null;
  const time = new Date(isoDate).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now - time) / DAY_MS));
}

export function crmStatus(customer, now = Date.now(), activity = appState.activity) {
  if (Number(customer.visits || 0) === 0) return { key: 'new', label: 'New' };
  const elapsed = daysSince(lastVisitAt(customer, activity), now);
  if (elapsed === null || elapsed > 45) return { key: 'follow-up', label: 'Follow-up' };
  if (elapsed > 30) return { key: 'cooling', label: 'Cooling' };
  return { key: 'active', label: 'Active' };
}

function relativeVisit(customer) {
  const elapsed = daysSince(lastVisitAt(customer));
  if (elapsed === null) return 'No visits yet';
  if (elapsed === 0) return 'Visited today';
  if (elapsed === 1) return 'Visited yesterday';
  return `Visited ${elapsed} days ago`;
}

function matchesSegment(customer, segment) {
  if (segment === 'follow-up') return crmStatus(customer).key === 'follow-up';
  if (segment === 'reward-ready') return rewardReady(customer);
  return true;
}

export function populateCrmForm(customer) {
  if (!customer) return;
  appState.crmFormRevision = (appState.crmFormRevision || 0) + 1;
  document.getElementById('crmName').value = customer.name || '';
  document.getElementById('crmToken').value = customer.token || '';
  document.getElementById('crmEmail').value = customer.email || '';
  document.getElementById('crmPhone').value = customer.phone || '';
  document.getElementById('crmContactConsent').checked = Boolean(customer.contactConsent);
  document.getElementById('customerFormTitle').textContent = `Edit ${customer.name}`;
  document.getElementById('btnDeleteCustomer').hidden = false;
  if (customer.email || customer.phone || customer.contactConsent) {
    document.querySelector('.optional-fields').open = true;
  }
}

export function resetCrmForm() {
  appState.crmFormRevision = (appState.crmFormRevision || 0) + 1;
  appState.selectedCrmCustomerId = null;
  setNoteDraftCustomer('profileNote', null);
  ['crmName', 'crmToken', 'crmEmail', 'crmPhone'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('crmContactConsent').checked = false;
  document.getElementById('customerFormTitle').textContent = 'Add customer';
  document.getElementById('btnDeleteCustomer').hidden = true;
  document.getElementById('customerFormNotice').textContent = 'Name is the only required detail.';
  document.getElementById('customerFormNotice').classList.remove('error');
  document.getElementById('crmProfile').className = 'empty-state';
  document.getElementById('crmProfile').innerHTML = '<strong>Select a customer</strong><span>Their progress and loyalty card will appear here.</span>';
  document.getElementById('customerCardArea').hidden = true;
  document.getElementById('crmTimeline').textContent = '';
  window.dispatchEvent(new CustomEvent('lfa:crm-customer-selected', { detail: { customerId: null } }));
}

function normaliseToken(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '-');
}

export async function saveCustomerFromForm() {
  const name = document.getElementById('crmName').value.trim().slice(0, 120);
  const email = document.getElementById('crmEmail').value.trim().toLowerCase().slice(0, 254);
  const phone = document.getElementById('crmPhone').value.trim().slice(0, 40);
  const requestedToken = normaliseToken(document.getElementById('crmToken').value);
  const contactConsent = document.getElementById('crmContactConsent').checked;
  const selectedId = appState.selectedCrmCustomerId;
  if (!name) return { error: 'Enter the customer’s name.' };
  if (email && !EMAIL_PATTERN.test(email)) return { error: 'Check the email address or leave it blank.' };
  if (requestedToken && !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(requestedToken)) return { error: 'Use only letters, numbers, hyphens and underscores in the customer code.' };
  const result = await updateState(draft => {
    let customer = draft.customers.find(item => item.id === selectedId);
    if (selectedId && !customer) throw new Error('This customer no longer exists. Reload before editing.');
    const token = requestedToken || customer?.token || customerCode(draft.customers);
    const duplicate = draft.customers.find(item => item.id !== customer?.id && String(item.token).toLowerCase() === token.toLowerCase());
    if (duplicate) return { error: `That customer code already belongs to ${duplicate.name}.` };
    if (!customer) {
      customer = { id: uid('cust'), token, visits: 0, points: 0, tier: 'Standard', notes: [], redemptions: [], surpriseRewards: [], createdAt: nowIso() };
      draft.customers.push(customer);
      addActivity(draft, 'customer_created', customer.id, 'Customer added');
    }
    Object.assign(customer, { name, token, email, phone, contactConsent });
    customer.tier = customerTierForPoints(customer.points, draft.branding);
    customer.lastInteractionAt ||= nowIso();
    return { customer };
  });
  return result;
}

export async function deleteSelectedCustomer() {
  const selectedId = appState.selectedCrmCustomerId;
  const removed = await updateState(draft => {
    const index = draft.customers.findIndex(customer => customer.id === selectedId);
    if (index < 0) return false;
    const [customer] = draft.customers.splice(index, 1);
    draft.activity = draft.activity.filter(activity => activity.customerId !== customer.id);
    return customer;
  });
  return removed;
}

export function selectCrmCustomer(customerId) {
  const customer = getCustomerById(customerId);
  if (!customer) return null;
  appState.selectedCrmCustomerId = customer.id;
  populateCrmForm(customer);
  renderCustomerProfile(customer);
  renderCustomerTimeline(customer);
  renderCrmList();
  window.dispatchEvent(new CustomEvent('lfa:crm-customer-selected', { detail: { customerId: customer.id } }));
  return customer;
}

export function renderCrmList() {
  const query = document.getElementById('crmSearch').value.trim().toLowerCase();
  const segment = document.getElementById('crmSegmentFilter').value;
  const filtered = appState.customers
    .filter(customer => `${customer.name} ${customer.token} ${customer.email || ''} ${customer.phone || ''}`.toLowerCase().includes(query))
    .filter(customer => matchesSegment(customer, segment))
    .sort((a, b) => {
      const priority = { 'follow-up': 0, cooling: 1, active: 2, new: 3 };
      return priority[crmStatus(a).key] - priority[crmStatus(b).key]
        || String(a.name).localeCompare(String(b.name));
    });

  document.getElementById('crmList').innerHTML = filtered.length
    ? filtered.map(customer => {
      const status = crmStatus(customer);
      return `<button class="customer-list-item${customer.id === appState.selectedCrmCustomerId ? ' selected' : ''}" data-cid="${escapeHtml(customer.id)}" type="button">
        <span><strong>${escapeHtml(customer.name)}</strong><span>${escapeHtml(customer.token)} · ${relativeVisit(customer)}</span></span>
        <span class="status-pill ${status.key}">${rewardReady(customer) ? 'Reward ready' : status.label}</span>
      </button>`;
    }).join('')
    : '<div class="empty-state"><strong>No customers found</strong><span>Try another search or add a customer.</span></div>';

  document.querySelectorAll('.customer-list-item').forEach(button => {
    button.addEventListener('click', () => selectCrmCustomer(button.dataset.cid));
  });
}

export function renderCustomerProfile(customer) {
  setNoteDraftCustomer('profileNote', customer);
  const target = document.getElementById('crmProfile');
  const cardArea = document.getElementById('customerCardArea');
  if (!customer) {
    target.className = 'empty-state';
    target.innerHTML = '<strong>Select a customer</strong><span>Their progress and loyalty card will appear here.</span>';
    cardArea.hidden = true;
    return;
  }

  const status = crmStatus(customer);
  const joined = customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('en-AU') : 'Unknown';
  target.className = '';
  target.innerHTML = `<div class="customer-profile-grid">
    <div><span>Status</span><strong>${rewardReady(customer) ? 'Reward ready' : status.label}</strong></div>
    <div><span>Visits</span><strong>${Number(customer.visits || 0)}</strong></div>
    <div><span>Points</span><strong>${Number(customer.points || 0)}</strong></div>
    <div><span>Last visit</span><strong>${relativeVisit(customer).replace('Visited ', '')}</strong></div>
    <div><span>Contact consent</span><strong>${customer.contactConsent ? 'Recorded' : 'No'}</strong></div>
    <div><span>Customer since</span><strong>${joined}</strong></div>
  </div>`;
  cardArea.hidden = false;
}

const activityLabels = {
  customer_created: 'Customer added',
  visit: 'Visit recorded',
  note: 'Private note',
  bonus_points: 'Bonus points',
  reward_redeemed: 'Reward given',
  surprise_reward: 'Surprise reward unlocked',
  surprise_redeemed: 'Surprise reward given'
};

export function renderCustomerTimeline(customer) {
  const target = document.getElementById('crmTimeline');
  if (!customer) {
    target.textContent = '';
    return;
  }
  const timeline = appState.activity.filter(activity => activity.customerId === customer.id).slice(0, 12);
  target.innerHTML = timeline.length
    ? `<ul>${timeline.map(item => `<li><strong>${escapeHtml(activityLabels[item.type] || item.type.replaceAll('_', ' '))}</strong>${item.details ? ` · ${escapeHtml(item.details)}` : ''}<time datetime="${escapeHtml(item.at)}">${new Date(item.at).toLocaleString('en-AU')}</time></li>`).join('')}</ul>`
    : '<p class="muted">No history yet.</p>';
}
