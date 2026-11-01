// Protected assets exist only in the Worker bundle, never the public asset store.
// Normalize once for authorization and dispatch to avoid encoded-path discrepancies.
export function canonicalPath(pathname) {
  let path = pathname;
  for (let i = 0; i < 4 && path.includes('%'); i += 1) {
    try { path = decodeURIComponent(path); } catch { return null; }
  }
  if (path.includes('%') || /[\\\u0000-\u001f\u007f]/u.test(path) || !path.startsWith('/') || path.startsWith('//')) return null;
  return new URL(path.replace(/\/{2,}/gu, '/'), 'https://path.invalid').pathname;
}

const PUBLIC_COMMUNITY_FILES = new Set([
  '/community/register', '/community/register/',
  '/community/welcome', '/community/welcome/',
  '/community/privacy.html', '/community/terms.html',
  '/community/privacy', '/community/terms',
  '/community/css/styles.css',
  '/community/assets/loyalty-4-all-logo.png',
  '/community/assets/apple-touch-icon.png',
  '/community/assets/icon-192.png', '/community/assets/icon-512.png'
]);

export function requiresRegistration(path) {
  return (path === '/community' || path.startsWith('/community/')) && !PUBLIC_COMMUNITY_FILES.has(path);
}

export function registrationRequiredResponse(request, path) {
  const navigation = request.headers.get('sec-fetch-mode') === 'navigate'
    || path === '/community' || path === '/community/' || path === '/community/index.html';
  if (navigation) return new Response(null, { status: 303, headers: { Location: '/community/register', 'Cache-Control': 'no-store' } });
  return Response.json({ code: 'registration_required', message: 'Register before opening the app.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}
