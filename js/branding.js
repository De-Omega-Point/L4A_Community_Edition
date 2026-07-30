import { appState, storageKeys } from './state.js';

export function applyBranding() {
  const colour = appState.branding.brandColour || '#176b43';
  document.documentElement.style.setProperty('--brand-colour', colour);
  document.getElementById('brandTitle').textContent = appState.branding.businessName;
  document.getElementById('cardBrandName').textContent = appState.branding.businessName;

  const logo = document.getElementById('brandLogoPreview');
  if (appState.branding.brandLogo) {
    logo.src = appState.branding.brandLogo;
    logo.style.display = 'block';
    logo.alt = `${appState.branding.businessName} logo`;
  } else {
    logo.style.display = 'none';
    logo.removeAttribute('src');
    logo.alt = '';
  }
}

export function loadBranding(defaultBusinessName = '') {
  try {
    const raw = localStorage.getItem(storageKeys.branding) || localStorage.getItem(storageKeys.legacyBranding) || '{}';
    appState.branding = { ...appState.branding, ...JSON.parse(raw) };
  } catch {}
  if (defaultBusinessName && (!appState.branding.businessName || appState.branding.businessName === 'Loyalty-4-All')) {
    appState.branding.businessName = defaultBusinessName;
  }
  persistBranding();
  populateBrandingForm();
  applyBranding();
}

function populateBrandingForm() {
  document.getElementById('settingsBusinessName').value = appState.branding.businessName;
  document.getElementById('settingsBrandColour').value = appState.branding.brandColour;
  document.getElementById('settingsBrandLogo').value = appState.branding.brandLogo;
  document.getElementById('settingsPointsPerVisit').value = appState.branding.pointsPerVisit;
  document.getElementById('settingsRewardThreshold').value = appState.branding.rewardThreshold;
  document.getElementById('settingsRewardName').value = appState.branding.rewardName;
}

function persistBranding() {
  localStorage.setItem(storageKeys.branding, JSON.stringify(appState.branding));
}

export function saveBranding() {
  appState.branding.businessName = document.getElementById('settingsBusinessName').value.trim() || 'Loyalty for All';
  appState.branding.brandColour = document.getElementById('settingsBrandColour').value || '#176b43';
  appState.branding.brandLogo = document.getElementById('settingsBrandLogo').value.trim();
  persistBranding();
  applyBranding();
  return true;
}

export function saveRewardSettings() {
  const pointsPerVisit = Math.max(1, Math.min(100, Number(document.getElementById('settingsPointsPerVisit').value || 5)));
  const rewardThreshold = Math.max(1, Math.min(10000, Number(document.getElementById('settingsRewardThreshold').value || 50)));
  const rewardName = document.getElementById('settingsRewardName').value.trim() || 'Free reward';
  appState.branding.pointsPerVisit = pointsPerVisit;
  appState.branding.rewardThreshold = rewardThreshold;
  appState.branding.rewardName = rewardName;
  persistBranding();
  populateBrandingForm();
  return true;
}
