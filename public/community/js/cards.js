import { appState, getCustomerById } from './state.js';
import { qrDataUrl, renderQrIntoCanvas } from './qr.js';
import { escapeHtml } from './utils.js';

export function renderCardOptions() {
  const select = document.getElementById('cardCustomer');
  const selected = select.value;
  select.innerHTML = appState.customers.length
    ? appState.customers.map(customer => `<option value="${customer.id}">${escapeHtml(customer.name)} (${escapeHtml(customer.token)})</option>`).join('')
    : '<option value="">Add a customer first</option>';
  if (appState.customers.some(customer => customer.id === selected)) select.value = selected;
}

export function renderCardPreviewForCustomer(customerId = document.getElementById('cardCustomer').value) {
  const customer = getCustomerById(customerId);
  if (!customer) {
    document.getElementById('cardCustomerName').textContent = 'No customer selected';
    document.getElementById('cardCustomerProgress').textContent = '0 visits · 0 points';
    document.getElementById('cardCustomerToken').textContent = 'Customer code';
    const canvas = document.getElementById('cardQrCanvas');
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    return false;
  }
  document.getElementById('cardCustomerName').textContent = customer.name;
  document.getElementById('cardCustomerProgress').textContent = `${Number(customer.visits || 0)} visits · ${Number(customer.points || 0)} points`;
  document.getElementById('cardCustomerToken').textContent = customer.token;
  renderQrIntoCanvas(customer.token, document.getElementById('cardQrCanvas'));
  return true;
}

export function exportCardPng() {
  const customer = getCustomerById(document.getElementById('cardCustomer').value);
  if (!customer) return false;
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 540;
  const context = canvas.getContext('2d');
  if (!context) return false;

  const brandColour = getComputedStyle(document.documentElement).getPropertyValue('--brand-colour').trim() || '#10b981';
  const gradient = context.createLinearGradient(0, 0, 900, 540);
  gradient.addColorStop(0, brandColour);
  gradient.addColorStop(1, '#0f241a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 900, 540);

  context.fillStyle = '#ffffff';
  context.font = '700 34px sans-serif';
  context.fillText(appState.branding.businessName, 45, 70);
  context.font = '700 48px sans-serif';
  context.fillText(customer.name, 45, 235);
  context.font = '28px sans-serif';
  context.fillText(`${Number(customer.visits || 0)} visits · ${Number(customer.points || 0)} points`, 45, 285);
  context.font = '28px monospace';
  context.fillText(customer.token, 45, 485);

  const qrImage = new Image();
  qrImage.onload = () => {
    context.drawImage(qrImage, 630, 45, 225, 225);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${customer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'customer'}-loyalty-card.png`;
    link.click();
  };
  qrImage.src = qrDataUrl(customer.token, 300);
  return true;
}

export function emailCardImage() {
  const customer = getCustomerById(document.getElementById('cardCustomer').value);
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
  const cards = appState.customers.map(customer => `
    <div class="sheet-card">
      <div class="copy">
        <strong>${escapeHtml(appState.branding.businessName)}</strong>
        <h2>${escapeHtml(customer.name)}</h2>
        <p>${escapeHtml(customer.token)}</p>
      </div>
      <img src="${qrDataUrl(customer.token, 220)}" alt="QR code for ${escapeHtml(customer.name)}" />
    </div>`).join('');
  printWindow.document.write(`<!doctype html><html><head><title>Loyalty Cards</title><style>
    @page{size:A4;margin:10mm} body{font-family:Arial,sans-serif;margin:0}
    .sheet-card{width:85.6mm;height:54mm;border:1px solid #bbb;border-radius:4mm;margin:3mm;display:inline-flex;vertical-align:top;padding:5mm;box-sizing:border-box;justify-content:space-between;page-break-inside:avoid}
    .sheet-card h2{margin:10mm 0 2mm;font-size:18px}.sheet-card p{font-family:monospace}.sheet-card img{width:32mm;height:32mm}
  </style></head><body>${cards}</body></html>`);
  printWindow.document.close();
  printWindow.addEventListener('load', () => printWindow.print(), { once: true });
  return true;
}
