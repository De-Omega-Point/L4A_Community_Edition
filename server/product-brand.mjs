// Trusted, fixed product chrome. Reuse the authentic public asset; no merchant
// identity, caller HTML or remote image is interpolated into generated screens.
export const PRODUCT_BRAND_HTML = '<header data-l4a-product-brand><a href="/" aria-label="Loyalty4All home"><img src="/community/assets/loyalty-4-all-logo.png" width="112" height="112" alt=""><strong>Loyalty4All</strong> <span>Community Edition</span></a></header>';
const escape = value => String(value).replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function isHtmlNavigation(request) {
  return !new URL(request.url).pathname.startsWith('/api/')
    && (request.headers.get('sec-fetch-mode') === 'navigate' || (request.headers.get('accept') || '').includes('text/html'));
}
export function brandedErrorResponse(request, message, status, cache = 'private, no-store') {
  if (!isHtmlNavigation(request)) return new Response(message, { status, headers: { 'Cache-Control': cache } });
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Loyalty-4-All — ${status}</title></head><body>${PRODUCT_BRAND_HTML}<main><h1>${escape(message)}</h1><p><a href="/">Return to Loyalty-4-All</a></p></main></body></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" },
  });
}

// Presentation wrapper only: historical notice files/legal text remain byte-for-
// byte unchanged on disk. Never touches JSON, redirects, HEAD, or non-HTML bodies.
export async function addProductBrandChrome(response, { head = false } = {}) {
  if (head || response.status === 204 || response.status === 304
      || !(response.headers.get('Content-Type') || '').toLowerCase().includes('text/html')) return response;
  const html = await response.text();
  const branded = html.includes('data-l4a-product-brand') || html.includes('/community/assets/loyalty-4-all-logo.png')
    ? html : html.replace(/<body\b[^>]*>/iu, body => body + PRODUCT_BRAND_HTML);
  const headers = new Headers(response.headers);
  if (branded !== html) {
    headers.delete('Content-Length'); headers.delete('ETag'); headers.delete('Content-MD5');
    // Do not weaken an existing CSP. Historical assets currently have none; if
    // a future asset policy blocks this image, fix it explicitly at that source.
  }
  return new Response(branded, { status: response.status, statusText: response.statusText, headers });
}
