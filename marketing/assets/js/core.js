(function (root) {
  'use strict';
  function normaliseRequest(input) {
    const clean = value => String(value ?? '').trim().replace(/[\r\n\t]+/g, ' ');
    return {
      message: String(input.message ?? '').replace(/\r\n?/g, '\n').trim(),
      businessName: clean(input.businessName),
      email: clean(input.email).toLowerCase(),
      contactName: clean(input.contactName),
      privacyAccepted: input.privacyAccepted === true
    };
  }
  function validateRequest(data) {
    if (!data.message || data.message.length > 2000) return 'Enter a message of up to 2,000 characters.';
    if (data.businessName.length > 120) return 'Keep your business name to 120 characters or fewer.';
    if (data.email && (data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) return 'Enter a valid contact email address.';
    if (data.contactName.length > 120) return 'Keep your name to 120 characters or fewer.';
    if (!data.privacyAccepted) return 'Please read and acknowledge the privacy notice.';
    return '';
  }
  function buildRequestText(data, privacyVersion) {
    return [
      'Hello De-Omega-Point,', '',
      'I have feedback or a support question about Loyalty-4-All.', '',
      data.message, '',
      `Business: ${data.businessName || 'Not provided'}`,
      `Preferred reply email: ${data.email || 'Use my sending address'}`,
      `Contact name: ${data.contactName || 'Not provided'}`,
      '', 'Sending this message does not subscribe me to updates.',
      `Privacy notice acknowledged: ${privacyVersion}`, '',
      'This is feedback or a support request, not a purchase, registration or app-access confirmation.'
    ].join('\n');
  }
  function buildMailto(recipient, body) {
    if (!/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(recipient)) throw new Error('Invalid contact address.');
    return `mailto:${recipient}?subject=${encodeURIComponent('Loyalty-4-All feedback and support')}&body=${encodeURIComponent(body)}`;
  }
  function forgetLegacyData(storage) {
    // Never call clear(): this origin may host other products.
    storage.removeItem('l4a_orders');
    storage.removeItem('l4a_current_order');
  }
  root.L4A = Object.freeze({ normaliseRequest, validateRequest, buildRequestText, buildMailto, forgetLegacyData });
  if (typeof document !== 'undefined') {
    const button = document.querySelector('[data-clear-legacy]');
    button?.addEventListener('click', () => {
      const status = document.querySelector('[data-legacy-status]');
      try {
        forgetLegacyData(root.localStorage);
        status.textContent = 'Old prototype order data removed from this website. App records and email are unchanged.';
      } catch {
        status.textContent = 'Browser storage is unavailable. You can manage this website’s data in browser settings.';
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
