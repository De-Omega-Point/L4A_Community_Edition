// Pure review guard only. No database access, mutation, scheduler or HTTP route.
// Purpose-based retention requires an accountable decision, not a guessed TTL.
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function reviewRegistrationRetention(input) {
  if (!input || !UUID.test(input.productId) || typeof input.reviewedBy !== 'string' || !input.reviewedBy.trim()
      || typeof input.reason !== 'string' || !input.reason.trim()
      || typeof input.legalHold !== 'boolean' || typeof input.purposeStillNeeded !== 'boolean'
      || !Number.isFinite(Date.parse(input.reviewedAt)) || !Number.isFinite(Date.parse(input.nextReviewAt))
      || Date.parse(input.nextReviewAt) <= Date.parse(input.reviewedAt)) throw new Error('Complete the exact-record retention review.');
  return Object.freeze({
    productId: input.productId,
    reviewedAt: new Date(input.reviewedAt).toISOString(),
    nextReviewAt: new Date(input.nextReviewAt).toISOString(),
    reviewedBy: input.reviewedBy.trim(), reason: input.reason.trim(),
    decision: input.legalHold || input.purposeStillNeeded ? 'retain-and-review' : 'approval-required-for-disposal',
    legalHold: input.legalHold,
    executable: false,
  });
}
