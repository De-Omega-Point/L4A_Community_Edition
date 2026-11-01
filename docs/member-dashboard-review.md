> Historical/candidate review document. See [current release status](RELEASE_STATUS.md) and the root README for the official source destination and current limits. This document is not deployment authorization.

# Local-only member dashboard review

This candidate extends the existing Community app, not a new project. It has not
been deployed or pushed. No production data, registration gate, remote storage,
schema, credentials or paid capabilities were changed.

## Behavior
- **Members** opens a read-only local dashboard. Opening it cannot award points.
- Defaults remain 1 point per recorded check-in, with unlimited deliberate visits.
  Saved merchant points-per-visit, target, reward label and surprise settings are
  preserved. **Edit reward rules** opens existing Settings; no configurable daily
  cap is claimed or added.
- Reuses CRM activity status: a recorded visit 0–30 whole elapsed days ago is Active.
  This means less than 31 elapsed days, not a membership subscription status.
- Excludes demo customers from dashboard totals and lists.
- Active/all-member filter and name/code search; latest visit first.
- Each row opens the existing counter, where Record Visit remains an explicit
  saved action. Existing in-flight duplicate-click guard is retained.
- Points are current balances and visits are all-time totals. No misleading
  period-visit total is derived from the bounded activity history.
- Reward progress uses current merchant settings. Standard eligibility is not
  treated as a reward already issued. Given standard rewards are counted from
  recorded redemptions; surprise earned/pending/given uses stored awards.
  Unrecorded historical awards are not reconstructed.
- Navigation, save/redeem/restore redraws and visibility return refresh the dashboard.
  Search and filter remain selected through redraws.

## Compatibility and accessibility
No stored schema fields added. Existing backup/restore works unchanged. Text is
escaped before rendering member names/codes/reward labels. Labelled filters,
keyboard-operable member buttons and responsive card layout avoid a wide table.
The offline shell includes the new module and is bumped to v29; existing
wait-for-old-tabs-to-close update behavior is preserved.

The old body minimum width caused horizontal overflow in a 320px Chromium iframe
with a classic scrollbar (305px content viewport). It is removed in this candidate;
this finding is not evidence of a failure on every real 320px mobile device.

## Verification
Run `npm run check` for lint, verified Worker build, all tests, and TypeScript.
Specific dashboard tests cover empty/demo exclusion, shared activity-window
boundaries, legacy visit fallback, current totals/settings, search/nonmutation,
escaped content, repeated deliberate same-day point awards, standard versus
surprise award tracking, and restore preservation. Existing data-safety coverage
exercises the accidental duplicate-click guard and storage failure paths.

Browser QA is conducted separately using synthetic local records. Actual
Safari/iOS, Android Chrome, Firefox, Edge, installed PWA update/install/uninstall,
camera permissions, native print/PDF and real-device touch remain physical or
browser-engine checks unless explicitly reported otherwise. No universal
all-device/browser guarantee is made.
