import { appState, loadBrandingState, saveBrandingState } from './state.js';

const SUPPORTED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_LOGO_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_STORED_LOGO_LENGTH = 900_000;

function brandInitials(name) {
  const words = String(name || 'My Business').trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) || 'MB').toUpperCase();
}

function renderLogoSlot(imageId, fallbackId, source, businessName) {
  const image = document.getElementById(imageId);
  const fallback = document.getElementById(fallbackId);
  if (!image || !fallback) return;

  fallback.textContent = brandInitials(businessName);
  const showFallback = () => {
    image.style.display = 'none';
    image.removeAttribute('src');
    fallback.style.display = 'grid';
  };

  if (!source) return showFallback();
  image.onload = () => {
    image.style.display = 'block';
    fallback.style.display = 'none';
  };
  image.onerror = showFallback;
  image.alt = '';
  image.src = source;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The logo file could not be read.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That image could not be opened.'));
    image.src = source;
  });
}

export function refreshBrandDraftPreview() {
  const nameInput = document.getElementById('settingsBusinessName');
  const logoInput = document.getElementById('settingsBrandLogo');
  if (!nameInput || !logoInput) return;
  const name = nameInput.value.trim() || 'My Business';
  document.getElementById('settingsBrandNamePreview').textContent = name;
  renderLogoSlot('settingsBrandLogoPreview', 'settingsBrandLogoFallback', logoInput.value, name);
}

export async function stageBrandLogoFile(file) {
  if (!file) throw new Error('Choose a logo image first.');
  if (!SUPPORTED_LOGO_TYPES.has(file.type)) throw new Error('Use a PNG, JPEG or WebP logo.');
  if (file.size > MAX_LOGO_UPLOAD_BYTES) throw new Error('That logo is over 5 MB. Choose a smaller image.');

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the logo.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let storedLogo = canvas.toDataURL('image/webp', 0.88);
  if (!storedLogo.startsWith('data:image/webp')) storedLogo = canvas.toDataURL('image/png');
  if (storedLogo.length > MAX_STORED_LOGO_LENGTH) {
    storedLogo = canvas.toDataURL('image/jpeg', 0.82);
  }
  if (storedLogo.length > MAX_STORED_LOGO_LENGTH) throw new Error('That logo remains too large after resizing.');

  document.getElementById('settingsBrandLogo').value = storedLogo;
  refreshBrandDraftPreview();
  return 'Logo ready. Save settings to keep it on this device.';
}

export function removeBrandLogoDraft() {
  document.getElementById('settingsBrandLogo').value = '';
  document.getElementById('settingsBrandLogoFile').value = '';
  refreshBrandDraftPreview();
}

export function applyBranding() {
  const colour = appState.branding.brandColour || '#07865f';
  document.documentElement.style.setProperty('--brand-colour', colour);
  const red = Number.parseInt(colour.slice(1, 3), 16);
  const green = Number.parseInt(colour.slice(3, 5), 16);
  const blue = Number.parseInt(colour.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  document.documentElement.style.setProperty('--brand-on-colour', luminance > 0.58 ? '#15231e' : '#ffffff');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = colour;
  document.getElementById('brandTitle').textContent = appState.branding.businessName;
  document.getElementById('cardBrandName').textContent = appState.branding.businessName;
  document.getElementById('settingsProductId').textContent = appState.branding.productId;
  renderLogoSlot('brandLogoPreview', 'brandLogoFallback', appState.branding.brandLogo, appState.branding.businessName);
  renderLogoSlot('cardMerchantLogo', 'cardMerchantMonogram', appState.branding.brandLogo, appState.branding.businessName);
}

export async function loadBranding() {
  await loadBrandingState();
  populateSettingsForm();
  applyBranding();
}

export function populateSettingsForm() {
  document.getElementById('settingsBusinessName').value = appState.branding.businessName;
  document.getElementById('settingsBrandColour').value = appState.branding.brandColour;
  document.getElementById('settingsBrandLogo').value = appState.branding.brandLogo;
  document.getElementById('settingsPointsPerVisit').value = appState.branding.pointsPerVisit;
  document.getElementById('settingsRewardThreshold').value = appState.branding.rewardThreshold;
  document.getElementById('settingsRewardName').value = appState.branding.rewardName;
  document.getElementById('settingsSurpriseEnabled').checked = Boolean(appState.branding.surpriseEnabled);
  document.getElementById('settingsSurpriseChance').value = String(appState.branding.surpriseChance || 20);
  document.getElementById('settingsSurpriseRewardName').value = appState.branding.surpriseRewardName || 'Surprise reward';
  document.getElementById('settingsBrandLogoFile').value = '';
  refreshBrandDraftPreview();
}

function safeLogoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(raw)) return raw;
  try {
    const url = new URL(raw, location.href);
    return ['http:', 'https:'].includes(url.protocol) ? raw : '';
  } catch {
    return '';
  }
}

export async function saveSettings() {
  const fields = ['settingsBusinessName', 'settingsBrandColour', 'settingsBrandLogo', 'settingsPointsPerVisit', 'settingsRewardThreshold', 'settingsRewardName', 'settingsSurpriseChance', 'settingsSurpriseRewardName'];
  const formValue = () => fields.map(id => document.getElementById(id).value).join('\u0000') + document.getElementById('settingsSurpriseEnabled').checked;
  const originalForm = formValue();
  const branding = { ...appState.branding };
  branding.businessName = document.getElementById('settingsBusinessName').value.trim().slice(0, 120) || 'My Business';
  branding.brandColour = document.getElementById('settingsBrandColour').value || '#07865f';
  branding.brandLogo = safeLogoUrl(document.getElementById('settingsBrandLogo').value);
  branding.pointsPerVisit = Math.max(1, Math.min(100, Number(document.getElementById('settingsPointsPerVisit').value || 1)));
  branding.rewardThreshold = Math.max(1, Math.min(10000, Number(document.getElementById('settingsRewardThreshold').value || 10)));
  branding.rewardName = document.getElementById('settingsRewardName').value.trim().slice(0, 80) || 'Free reward';
  branding.surpriseEnabled = document.getElementById('settingsSurpriseEnabled').checked;
  branding.surpriseChance = [10, 20, 50].includes(Number(document.getElementById('settingsSurpriseChance').value))
    ? Number(document.getElementById('settingsSurpriseChance').value)
    : 20;
  branding.surpriseRewardName = document.getElementById('settingsSurpriseRewardName').value.trim().slice(0, 80) || 'Surprise reward';
  await saveBrandingState(branding);
  if (formValue() === originalForm) populateSettingsForm();
  applyBranding();
  return true;
}

// Compatibility exports for older modules and backups.
export const saveBranding = saveSettings;
export const saveRewardSettings = saveSettings;
