import { appState, storageKeys } from './state.js';

const ALLOWED_INTERESTS = new Set([
  'ai-marketing',
  'social-media',
  'industry-trends',
  'product-updates'
]);

function readStoredMembership() {
  try {
    return JSON.parse(localStorage.getItem(storageKeys.communityMembership) || 'null');
  } catch {
    return null;
  }
}

function writeStoredMembership(value) {
  localStorage.setItem(storageKeys.communityMembership, JSON.stringify(value));
}

function setNotice(message, error = false) {
  const notice = document.getElementById('membershipNotice');
  notice.textContent = message;
  notice.classList.toggle('error', error);
}

function prefillMembershipForm(membership = readStoredMembership()) {
  const businessName = document.getElementById('membershipBusinessName');
  const contactName = document.getElementById('membershipContactName');
  const email = document.getElementById('membershipEmail');
  const businessType = document.getElementById('membershipBusinessType');

  businessName.value = membership?.businessName || appState.branding.businessName || '';
  contactName.value = membership?.contactName || '';
  email.value = membership?.email || '';
  businessType.value = membership?.businessType || '';

  if (Array.isArray(membership?.interests)) {
    document.querySelectorAll('#membershipForm input[name="interests"]').forEach(input => {
      input.checked = membership.interests.includes(input.value);
    });
  }
}

function showMembershipSuccess(membership) {
  document.getElementById('membershipFormPanel').hidden = true;
  document.getElementById('membershipSuccess').hidden = false;
  document.getElementById('membershipSuccessMessage').textContent =
    `Your preferences have been recorded for ${membership.email}.`;
}

function showMembershipUpdateNotice() {
  document.getElementById('membershipSuccessMessage').textContent =
    'For your security, changing an existing membership requires verified ownership. This is not available in the app yet. Your details and consent have not been changed, and your local loyalty app remains fully usable.';
}

async function submitMembership(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = document.getElementById('btnMembershipSubmit');
  const formData = new FormData(form);
  const interests = formData.getAll('interests')
    .map(value => String(value))
    .filter(value => ALLOWED_INTERESTS.has(value));

  if (!interests.length) {
    setNotice('Choose at least one type of update.', true);
    return;
  }

  const payload = {
    productId: appState.branding.productId,
    businessName: String(formData.get('businessName') || ''),
    contactName: String(formData.get('contactName') || ''),
    email: String(formData.get('email') || ''),
    businessType: String(formData.get('businessType') || ''),
    interests,
    updatesConsent: formData.get('updatesConsent') === 'on',
    termsConsent: formData.get('termsConsent') === 'on',
    website: String(formData.get('website') || '')
  };

  submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  setNotice('Registering your free access…');

  try {
    const response = await fetch('/api/community-members', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Registration is temporarily unavailable.');

    const membership = {
      businessName: payload.businessName.trim(),
      contactName: payload.contactName.trim(),
      email: payload.email.trim().toLowerCase(),
      businessType: payload.businessType,
      interests,
      registeredAt: result.registeredAt || new Date().toISOString()
    };
    let savedLocally = true;
    try { writeStoredMembership(membership); } catch { savedLocally = false; }
    showMembershipSuccess(membership);
    if (!savedLocally) document.getElementById('membershipSuccessMessage').textContent += ' This device could not remember them, but your registration was recorded.';
  } catch (error) {
    setNotice(error.message || 'Registration is temporarily unavailable. Please try again.', true);
  } finally {
    submit.disabled = false;
    form.removeAttribute('aria-busy');
  }
}

export function bindMembership() {
  const form = document.getElementById('membershipForm');
  form.addEventListener('submit', submitMembership);
  document.getElementById('btnUpdateMembership').addEventListener('click', showMembershipUpdateNotice);

  const membership = readStoredMembership();
  if (membership?.email) showMembershipSuccess(membership);
  else prefillMembershipForm();
}
