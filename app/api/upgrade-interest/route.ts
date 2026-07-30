const VALID_INTERESTS = new Set([
  "guided-setup",
  "growth-tools",
  "teams-locations",
]);

type UpgradeInterestPayload = {
  productId?: unknown;
  interest?: unknown;
};

function cleanText(value: unknown, maximumLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

export async function POST(request: Request) {
  try {
    const { env } = await import("cloudflare:workers");
    const body = (await request.json()) as UpgradeInterestPayload;
    const productId = cleanText(body.productId, 32);
    const interest = cleanText(body.interest, 40);

    if (!/^LFA-CE-[2-9A-HJ-NP-Z]{8}$/.test(productId) || !VALID_INTERESTS.has(interest)) {
      return Response.json({ error: "Invalid upgrade interest." }, { status: 400 });
    }

    const result = await env.DB.prepare(
      `UPDATE community_registrations
       SET upgrade_interest = ?, upgrade_interest_at = ?
       WHERE product_id = ?`,
    )
      .bind(interest, new Date().toISOString(), productId)
      .run();

    if (!result.meta.changes) {
      return Response.json({ error: "Product registration was not found." }, { status: 404 });
    }

    return Response.json({ recorded: true });
  } catch {
    return Response.json(
      { error: "Interest could not be recorded right now." },
      { status: 500 },
    );
  }
}

export async function GET() {
  return Response.json({ error: "Method not allowed." }, { status: 405 });
}
