import { PRODUCT_BRAND_HTML } from "../product-brand.mjs";
const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const escape = value => String(value ?? '').replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function page(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} | Loyalty-4-All</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:2rem;background:#f5f7f4;color:#16382d}main{max-width:1200px;margin:auto}a{color:#176247}table{border-collapse:collapse;width:100%;background:white}th,td{text-align:left;padding:.7rem;border:1px solid #ccd8d1;vertical-align:top}th{background:#e6eee9}small{display:block}.scroll{overflow-x:auto}nav{display:flex;gap:1rem;margin:1rem 0}</style></head><body><main>${PRODUCT_BRAND_HTML}<h1>${escape(title)}</h1>${body}</main></body></html>`, { status, headers: HEADERS });
}

/**
 * Sites dispatch supplies the documented stable identity header server-side.
 * Before enabling, verify that dispatch strips spoofed incoming identity headers,
 * no alternate public Worker origin exists, and the configured ID is the owner.
 * Neither a matching email nor a public Product ID grants owner access.
 * Default is CLOSED, including local previews; never bootstrap the first visitor.
 */
export async function ownerRegistrations(request, env) {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } });
  const expectedOwner = env.REGISTRATION_OWNER_SITE_USER_ID;
  if (env.REGISTRATION_OWNER_ACCESS_READY !== 'confirmed' || typeof expectedOwner !== 'string' || !expectedOwner || expectedOwner !== expectedOwner.trim()) {
    return page('Registrations', '<p>Owner access needs secure setup. This list remains closed, and no registration details have been loaded.</p>', 503);
  }
  const siteUserId = request.headers.get('oai-authenticated-user-id');
  if (!siteUserId) return page('Owner sign-in required', '<p>This private list is only for the app owner.</p><a href="/signin-with-chatgpt?return_to=%2Fowner%2Fregistrations" target="_top">Sign in to view registrations</a>', 401);
  if (siteUserId !== expectedOwner) return page('Access denied', '<p>This private list is only for the app owner.</p>', 403);
  const rawPage = new URL(request.url).searchParams.get('page') || '1';
  if (!/^[1-9][0-9]{0,2}$/u.test(rawPage)) return page('Invalid page', '<p>Use the Previous or Next links.</p>', 400);
  const pageNumber = Number(rawPage);
  try {
    if (!env.DB) throw new Error('missing database');
    // Explicit projection: never return the receipt hash or a bearer credential.
    const result = await env.DB.prepare(`SELECT id, kind, contact_name, business_name, email,
      marketing_consent, marketing_consent_at, marketing_consent_version,
      created_at, app_opened_at, install_requested_at, install_observed_at
      FROM registered_products ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?`).bind((pageNumber - 1) * 50).all();
    if (result?.success !== true || !Array.isArray(result.results)) throw new Error('query failed');
    const rows = result.results;
    const contents = rows.slice(0, 50).map(row => `<tr><td>${escape(row.id)}</td><td>${escape(row.contact_name)}${row.business_name ? `<small>${escape(row.business_name)}</small>` : ''}<small>${escape(row.kind)}</small></td><td>${escape(row.email)}</td><td>${row.marketing_consent === 1 ? 'Opted in' : 'Not opted in'}<small>${escape(row.marketing_consent_at)}</small></td><td>${escape(row.created_at)}</td><td>${escape(row.app_opened_at || 'Not observed')}</td><td>${escape(row.install_requested_at || 'Not observed')}</td><td>${escape(row.install_observed_at || 'Not observed')}</td></tr>`).join('');
    const nav = `<nav aria-label="Registration pages">${pageNumber > 1 ? `<a href="?page=${pageNumber - 1}">Previous</a>` : ''}<span>Page ${pageNumber}</span>${rows.length > 50 && pageNumber < 999 ? `<a href="?page=${pageNumber + 1}">Next</a>` : ''}</nav>`;
    return page('Registrations', `<p>Private owner list. Names and emails are supplied by registrants, not verified identities. Registration is not proof of installation. Only contact people for marketing when their recorded choice permits it.</p><p>App opens and install events are browser-reported observations, not verified download counts. Unsupported browsers or offline use may not report them.</p>${nav}<div class="scroll"><table><caption>Registered businesses and individuals</caption><thead><tr><th>Product ID</th><th>Registrant</th><th>Email</th><th>Marketing</th><th>Registered</th><th>App opened</th><th>Install requested</th><th>Install observed</th></tr></thead><tbody>${contents || '<tr><td colspan="8">No registrations on this page.</td></tr>'}</tbody></table></div>${nav}`);
  } catch {
    return page('Registrations unavailable', '<p>The registration list could not be loaded. No private details are shown. Try again later.</p>', 503);
  }
}
