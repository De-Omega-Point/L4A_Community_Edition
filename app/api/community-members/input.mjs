const MAXIMUM_BYTES = 20_000;

export function isSupportedProductId(value) {
  // Keep existing July Community identities valid during the web migration.
  return /^LFA-(?:LOCAL|CE)-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/u.test(value);
}

/** Read a bounded JSON object without trusting Content-Length. */
export async function readMembershipPayload(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    return { error: 'Use JSON for registration details.', status: 415 };
  }
  if (Number(request.headers.get('content-length') || 0) > MAXIMUM_BYTES) {
    return { error: 'The registration details are too large.', status: 413 };
  }
  const reader = request.body?.getReader();
  if (!reader) return { error: 'Registration details are required.', status: 400 };
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAXIMUM_BYTES) {
        await reader.cancel().catch(() => {});
        return { error: 'The registration details are too large.', status: 413 };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || Array.isArray(body) || typeof body !== 'object') {
      return { error: 'Registration details must be a JSON object.', status: 400 };
    }
    return { body };
  } catch {
    return { error: 'The registration details could not be read as JSON.', status: 400 };
  } finally {
    reader.releaseLock();
  }
}
