const PRODUCT_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegistrationPayload = {
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

function cleanText(value: unknown, maximumLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function generateProductId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(
    bytes,
    (value) => PRODUCT_ALPHABET[value % PRODUCT_ALPHABET.length],
  ).join("");
  return `LFA-CE-${suffix}`;
}

function surveyDueDate(): string {
  return new Date(Date.now() + 56 * 24 * 60 * 60 * 1000).toISOString();
}

export async function POST(request: Request) {
  try {
    const { env } = await import("cloudflare:workers");
    const body = (await request.json()) as RegistrationPayload;
    const businessName = cleanText(body.businessName, 120);
    const contactName = cleanText(body.contactName, 120);
    const email = cleanText(body.email, 254).toLowerCase();
    const businessType = cleanText(body.businessType, 80);
    const termsVersion = cleanText(body.termsVersion, 20);
    const privacyVersion = cleanText(body.privacyVersion, 20);
    const termsAccepted = body.termsAccepted === true;
    const feedbackConsent = body.feedbackConsent === true;

    if (!businessName || !contactName || !EMAIL_PATTERN.test(email)) {
      return Response.json(
        { error: "Business name, contact name and a valid email are required." },
        { status: 400 },
      );
    }

    if (!termsAccepted || !termsVersion || !privacyVersion || body.edition !== "community") {
      return Response.json(
        { error: "Terms and edition details are invalid." },
        { status: 400 },
      );
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const productId = generateProductId();

      try {
        await env.DB.prepare(
          `INSERT INTO community_registrations (
            id, product_id, business_name, contact_name, email, business_type,
            edition, terms_accepted, terms_version, privacy_version,
            feedback_consent, registered_at, survey_due_at, survey_status,
            welcome_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            crypto.randomUUID(),
            productId,
            businessName,
            contactName,
            email,
            businessType || null,
            "community",
            1,
            termsVersion,
            privacyVersion,
            feedbackConsent ? 1 : 0,
            new Date().toISOString(),
            feedbackConsent ? surveyDueDate() : null,
            "not_due",
            "pending",
          )
          .run();

        return Response.json({ productId }, { status: 201 });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("UNIQUE")) throw error;
      }
    }

    return Response.json(
      { error: "Could not issue a unique Product ID." },
      { status: 503 },
    );
  } catch {
    return Response.json(
      { error: "Registration is temporarily unavailable." },
      { status: 500 },
    );
  }
}

export async function GET() {
  return Response.json({ error: "Method not allowed." }, { status: 405 });
}
