// Retired in favour of the one required /register flow. Keep existing D1 rows
// unchanged; no legacy Product ID, email or alternate route may mutate them.
export async function POST() {
  return Response.json({ error: "Use the single registration form. Existing membership records are unchanged." }, {
    status: 410, headers: { "Cache-Control": "no-store" },
  });
}
