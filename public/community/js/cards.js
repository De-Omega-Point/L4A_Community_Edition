import { appState, getCustomerById } from './state.js';
import { qrDataUrl, renderQrIntoCanvas } from './qr.js';
import { escapeHtml } from './utils.js';

function selectedCustomer(customerId) {
  return getCustomerById(customerId || appState.selectedCrmCustomerId || appState.currentCustomerId);
}

export function renderCardOptions() {
  return appState.customers;
}

export function renderCardPreviewForCustomer(customerId) {
  const customer = selectedCustomer(customerId);
  if (!customer) {
    document.getElementById('cardCustomerName').textContent = 'No customer selected';
    document.getElementById('cardCustomerProgress').textContent = '0 visits · 0 points';
    document.getElementById('cardCustomerToken').textContent = 'Customer code';
    const canvas = document.getElementById('cardQrCanvas');
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    return false;
  }
  const visits = Number(customer.visits || 0);
  const points = Number(customer.points || 0);
  document.getElementById('cardCustomerName').textContent = customer.name;
  document.getElementById('cardCustomerProgress').textContent = `${visits} ${visits === 1 ? 'visit' : 'visits'} · ${points} ${points === 1 ? 'point' : 'points'}`;
  document.getElementById('cardCustomerToken').textContent = customer.token;
  renderQrIntoCanvas(customer.token, document.getElementById('cardQrCanvas'));
  return true;
}

// Print only an explicitly selected local member card, never the customer list.
export function printMemberCard(customerId) {
  if (document.readyState !== 'complete' || !customerId || !getCustomerById(customerId)) return false;
  if (!renderCardPreviewForCustomer(customerId)) return false;
  document.body.classList.add('printing-member-card');
  const cleanup = () => {
    document.body.classList.remove('printing-member-card');
    // A Visits print must not leave another member's card in the CRM profile.
    renderCardPreviewForCustomer(appState.selectedCrmCustomerId);
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  try { window.print(); } catch {
    cleanup();
    window.removeEventListener('afterprint', cleanup);
    return false;
  } finally {
    // A blocked/unsupported print host may return without firing afterprint.
    // Requiring a fully loaded document avoids deferred print-after-load.
    cleanup();
    window.removeEventListener('afterprint', cleanup);
  }
  return true;
}

function loadCanvasImage(source, anonymous = false) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (anonymous) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be loaded'));
    image.src = source;
  });
}

function drawContainedImage(context, image, x, y, width, height) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

function brandInitials() {
  const words = String(appState.branding.businessName || 'My Business').trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) || 'MB').toUpperCase();
}

export async function exportCardPng(customerId) {
  const customer = selectedCustomer(customerId);
  if (!customer) return false;
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 540;
  const context = canvas.getContext('2d');
  if (!context) return false;

  const brandColour = getComputedStyle(document.documentElement).getPropertyValue('--brand-colour').trim() || '#07865f';
  const gradient = context.createLinearGradient(0, 0, 900, 540);
  gradient.addColorStop(0, brandColour);
  gradient.addColorStop(1, '#0c2f23');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 900, 540);

  const productLogoUrl = new URL('assets/loyalty-4-all-logo.png', window.location.href).href;
  const merchantLogoSource = appState.branding.brandLogo || '';
  let qrImage;
  let productLogo;
  let merchantLogo = null;
  try {
    [qrImage, productLogo] = await Promise.all([
      loadCanvasImage(qrDataUrl(customer.token, 300)),
      loadCanvasImage(productLogoUrl)
    ]);
    if (merchantLogoSource) {
      merchantLogo = await loadCanvasImage(merchantLogoSource, /^https?:/i.test(merchantLogoSource)).catch(() => null);
    }
  } catch {
    return false;
  }

  context.fillStyle = 'rgba(255,255,255,.96)';
  context.fillRect(45, 38, 82, 82);
  if (merchantLogo) {
    drawContainedImage(context, merchantLogo, 51, 44, 70, 70);
  } else {
    context.fillStyle = brandColour;
    context.font = '800 27px sans-serif';
    context.textAlign = 'center';
    context.fillText(brandInitials(), 86, 90, 62);
    context.textAlign = 'left';
  }

  context.fillStyle = '#ffffff';
  context.font = '700 34px sans-serif';
  context.fillText(appState.branding.businessName, 147, 91, 438);
  context.font = '700 48px sans-serif';
  context.fillText(customer.name, 45, 235, 520);
  context.font = '28px sans-serif';
  const visits = Number(customer.visits || 0);
  const points = Number(customer.points || 0);
  context.fillText(`${visits} ${visits === 1 ? 'visit' : 'visits'} · ${points} ${points === 1 ? 'point' : 'points'}`, 45, 285, 520);
  context.font = '28px monospace';
  context.fillText(customer.token, 45, 485, 520);

  context.drawImage(qrImage, 630, 45, 225, 225);

  context.fillStyle = 'rgba(255,255,255,.96)';
  context.fillRect(590, 433, 265, 65);
  drawContainedImage(context, productLogo, 600, 440, 51, 51);
  context.fillStyle = '#15231e';
  context.font = '16px sans-serif';
  context.fillText('Powered locally by', 662, 459, 180);
  context.font = '700 19px sans-serif';
  context.fillText('Loyalty-4-All', 662, 483, 180);

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `${customer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'customer'}-loyalty-card.png`;
  link.click();
  return true;
}

export async function copyCustomerCode(customerId) {
  const customer = selectedCustomer(customerId);
  if (!customer || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(customer.token);
    return true;
  } catch {
    return false;
  }
}

export function emailCardImage(customerId) {
  const customer = selectedCustomer(customerId);
  if (!customer?.email || !customer.contactConsent) return false;
  const subject = `${appState.branding.businessName} loyalty card`;
  const body = `Hi ${customer.name},\n\nYour loyalty customer code is ${customer.token}.\n\nPlease keep this email and show your code when you visit.`;
  window.location.href = `mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return true;
}

export function batchPrintA4() {
  if (!appState.customers.length) return false;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  const productLogoUrl = new URL('assets/loyalty-4-all-logo.png', window.location.href).href;
  const merchantLogo = appState.branding.brandLogo
    ? `<img class="shop-logo" src="${escapeHtml(appState.branding.brandLogo)}" alt="" />`
    : `<span class="shop-monogram">${escapeHtml(brandInitials())}</span>`;
  const cards = appState.customers.map(customer => `
    <div class="sheet-card">
      <div class="copy">
        <div class="shop-brand">${merchantLogo}<strong>${escapeHtml(appState.branding.businessName)}</strong></div>
        <h2>${escapeHtml(customer.name)}</h2>
        <p>${escapeHtml(customer.token)}</p>
        <div class="powered"><img src="${escapeHtml(productLogoUrl)}" alt="" /><span>Powered by <strong>Loyalty-4-All</strong></span></div>
      </div>
      <img src="${qrDataUrl(customer.token, 220)}" alt="QR code for ${escapeHtml(customer.name)}" />
    </div>`).join('');
  printWindow.document.write(`<!doctype html><html lang="en-AU"><head><meta charset="UTF-8"><title>Loyalty Cards</title><style>
    @page{size:A4;margin:10mm} body{font-family:Arial,sans-serif;margin:0}
    .sheet-card{position:relative;width:85.6mm;height:54mm;border:1px solid #bbb;border-radius:4mm;margin:3mm;display:inline-flex;vertical-align:top;padding:4mm;box-sizing:border-box;justify-content:space-between;page-break-inside:avoid;overflow:hidden}
    .sheet-card h2{margin:6mm 0 1mm;font-size:18px}.sheet-card p{margin:0;font-family:monospace}.sheet-card>img{width:29mm;height:29mm}.copy{min-width:0;max-width:48mm}.shop-brand{display:flex;align-items:center;gap:2mm;white-space:nowrap}.shop-brand strong{overflow:hidden;text-overflow:ellipsis}.shop-logo,.shop-monogram{width:9mm;height:9mm;flex:0 0 9mm;border:1px solid #ccc;border-radius:2mm;object-fit:contain}.shop-monogram{display:grid;place-items:center;background:#edf7f2;color:#07563f;font-size:10px}.powered{position:absolute;right:4mm;bottom:3mm;display:flex;align-items:center;gap:1.5mm;font-size:8px}.powered img{width:6mm;height:6mm;border-radius:1mm;object-fit:contain}
  </style></head><body>${cards}</body></html>`);
  printWindow.document.close();
  printWindow.addEventListener('load', () => printWindow.print(), { once: true });
  return true;
}
