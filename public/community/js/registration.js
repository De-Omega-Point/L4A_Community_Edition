const REGISTRATION_KEY = 'loyalty4all.registration.v1';
const PRODUCT_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function config() {
  return window.LFA_CONFIG || {};
}

function randomCode(length = 8) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => PRODUCT_ALPHABET[value % PRODUCT_ALPHABET.length]).join('');
}

export function generateProductId() {
  return `LFA-CE-${randomCode(8)}`;
}

export function loadRegistration() {
  try {
    const value = JSON.parse(localStorage.getItem(REGISTRATION_KEY) || 'null');
    return value?.productId ? value : null;
  } catch {
    return null;
  }
}

export function saveRegistration(registration) {
  localStorage.setItem(REGISTRATION_KEY, JSON.stringify(registration));
  return registration;
}

function validateRegistration(payload) {
  if (!payload.businessName || !payload.contactName || !payload.email) {
    throw new Error('Business name, your name and email are required.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    throw new Error('Enter a valid email address.');
  }
  if (!payload.termsAccepted) {
    throw new Error('Please accept the Terms and Privacy Notice.');
  }
}

function isLocalPreview() {
  return location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
}

async function registerWithService(payload) {
  const endpoint = String(config().registrationEndpoint || '').trim();
  if (!endpoint) {
    if (!isLocalPreview()) {
      throw new Error('Registration is temporarily unavailable. Please try again later.');
    }
    return { productId: generateProductId(), registryStatus: 'development-local' };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('We could not complete registration. Please try again.');
  }

  const result = await response.json();
  if (!/^LFA-CE-[2-9A-HJ-NP-Z]{8}$/.test(String(result.productId || ''))) {
    throw new Error('The registration service returned an invalid Product ID.');
  }
  return { productId: result.productId, registryStatus: 'registered' };
}

export async function submitRegistration(form) {
  const formData = new FormData(form);
  const payload = {
    businessName: String(formData.get('businessName') || '').trim(),
    contactName: String(formData.get('contactName') || '').trim(),
    email: String(formData.get('email') || '').trim().toLowerCase(),
    businessType: String(formData.get('businessType') || '').trim(),
    termsAccepted: formData.get('termsAccepted') === 'on',
    feedbackConsent: formData.get('feedbackConsent') === 'on',
    termsVersion: config().termsVersion || '1.0',
    privacyVersion: config().privacyVersion || '1.0',
    registeredAt: new Date().toISOString(),
    edition: 'community'
  };

  validateRegistration(payload);
  const result = await registerWithService(payload);
  return saveRegistration({ ...payload, ...result });
}

export function applyRegistrationToUi(registration) {
  document.getElementById('headerProductId').textContent = registration.productId;
  document.getElementById('settingsProductId').textContent = registration.productId;
  document.getElementById('settingsRegisteredBusiness').textContent = registration.businessName;
}

export function feedbackUrl(registration) {
  const base = String(config().feedbackSurveyUrl || '').trim();
  if (!base) return '';
  const url = new URL(base, location.href);
  url.searchParams.set('product_id', registration.productId);
  return url.toString();
}

export const registrationStorageKey = REGISTRATION_KEY;
