const CONTENT_TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', ico: 'image/x-icon', wasm: 'application/wasm',
};

// Call only after registrationAccess has succeeded. Never fall back to ASSETS:
// protected bytes must not exist in a CDN/static archive that can skip Workers.
export function protectedCommunityResponse(request, path, assets) {
  const headers = new Headers({
    'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff',
  });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    headers.set('Allow', 'GET, HEAD');
    return new Response(null, { status: 405, headers });
  }
  let file = path === '/community/' ? '/community/index.html' : path;
  if (!Object.hasOwn(assets, file) && Object.hasOwn(assets, file + '.html')) file += '.html';
  if (!Object.hasOwn(assets, file)) return new Response(null, { status: 404, headers });
  const bytes = Uint8Array.from(atob(assets[file]), character => character.charCodeAt(0));
  headers.set('Content-Type', CONTENT_TYPES[file.split('.').pop()] || 'application/octet-stream');
  headers.set('Content-Length', String(bytes.byteLength));
  return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers });
}
