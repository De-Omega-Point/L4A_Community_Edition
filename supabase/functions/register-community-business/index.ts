const PRODUCT_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PRODUCT_ID_PATTERN = /^LFA-CE-[2-9A-HJ-NP-Z]{8}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegistrationRequest = {
  businessName?: unknown;
  contactName?: unknown;
  email?: unknown;
  businessType?: unknown;
  termsAccepted?: unknown;
  feedbackConsent?: unknown;
  termsVersion?: unknown;
  privacyVersion?: unknown;
  edition?: unknown;
};

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const configured = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return configured.includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(status: number, body: object, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
  });
}

function requiredText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function optionalText(value: unknown, maxLength: number): string | null {
  const text = requiredText(value, maxLength);
  return text || null;
}

function generateProductId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(bytes, value => PRODUCT_ALPHABET[value % PRODUCT_ALPHABET.length]).join('');
  return `LFA-CE-${suffix}`;
}

async function insertRegistration(record: Record<string, unknown>): Promise<string> {
  const baseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!baseUrl || !serviceKey) throw new Error('Registration service is not configured.');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const productId = generateProductId();
    const response = await fetch(`${baseUrl}/rest/v1/community_registrations`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ ...record, product_id: productId })
    });

    if (response.ok) {
      const rows = await response.json();
      const issuedId = rows?.[0]?.product_id;
      if (!PRODUCT_ID_PATTERN.test(issuedId)) throw new Error('Invalid Product ID issued.');
      return issuedId;
    }

    const errorBody = await response.text();
    if (response.status !== 409 || !errorBody.includes('product_id')) {
      throw new Error('Registration could not be stored.');
    }
  }

  throw new Error('Could not issue a unique Product ID.');
}

async function queueWelcomeEmail(payload: {
  productId: string;
  businessName: string;
  contactName: string;
  email: string;
}): Promise<void> {
  const webhookUrl = Deno.env.get('WELCOME_EMAIL_WEBHOOK_URL');
  const webhookSecret = Deno.env.get('WELCOME_EMAIL_WEBHOOK_SECRET');
  if (!webhookUrl || !webhookSecret) return;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${webhookSecret}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      event: 'community.registration.created',
      ...payload,
      edition: 'community',
      promise: 'Free forever'
    })
  });
}

Deno.serve(async request => {
  const origin = allowedOrigin(request);

  if (request.method === 'OPTIONS') {
    if (!origin) return json(403, { error: 'Origin not allowed.' }, null);
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' }, origin);
  if (request.headers.get('origin') && !origin) return json(403, { error: 'Origin not allowed.' }, null);

  try {
    const body = await request.json() as RegistrationRequest;
    const businessName = requiredText(body.businessName, 120);
    const contactName = requiredText(body.contactName, 120);
    const email = requiredText(body.email, 254).toLowerCase();
    const businessType = optionalText(body.businessType, 80);
    const termsVersion = requiredText(body.termsVersion, 20);
    const privacyVersion = requiredText(body.privacyVersion, 20);
    const termsAccepted = body.termsAccepted === true;
    const feedbackConsent = body.feedbackConsent === true;

    if (!businessName || !contactName || !EMAIL_PATTERN.test(email)) {
      return json(400, { error: 'Business name, contact name and a valid email are required.' }, origin);
    }
    if (!termsAccepted || !termsVersion || !privacyVersion || body.edition !== 'community') {
      return json(400, { error: 'Terms and edition details are invalid.' }, origin);
    }

    const productId = await insertRegistration({
      business_name: businessName,
      contact_name: contactName,
      email,
      business_type: businessType,
      terms_accepted: true,
      terms_version: termsVersion,
      privacy_version: privacyVersion,
      feedback_consent: feedbackConsent,
      survey_due_at: feedbackConsent
        ? new Date(Date.now() + 56 * 24 * 60 * 60 * 1000).toISOString()
        : null
    });

    EdgeRuntime.waitUntil(queueWelcomeEmail({ productId, businessName, contactName, email }));
    return json(201, { productId }, origin);
  } catch {
    return json(500, { error: 'Registration is temporarily unavailable.' }, origin);
  }
});

