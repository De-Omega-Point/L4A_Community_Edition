> Historical candidate review; current status is in docs/RELEASE_STATUS.md.

# Install-primary, browser-last local candidate

Prepared from the exact cumulative `l4a-self-service-install` candidate. Local only: no push, deployment, migration, credentials or server authorization changes.

## Behavior
- Installation remains the primary recommended action, using the existing genuine browser install prompt when available and device guidance otherwise.
- Continue in browser is a secondary fallback. Native modal explains local data loss, private browsing, device problems, clearing site data, browser changes, no automatic transfer, and backups for installed apps too.
- An unchecked acknowledgement and explicit acceptance are required. Cancel/close, Escape, Back/page exit and return-to-backup do not authorize browser use.
- Choice is a browser/profile/origin-local UX flag, not a receipt. Receipt checks remain mandatory for first online use. Browser and installed offline preparation markers are separate; confirmed missing receipts never unlock through these markers.
- Existing local records are untouched. Existing backup remains accessible before a move; Settings provides normal backup/restore after access is confirmed. Backups do not recover a registration receipt.
- Firefox on Mac explicitly cannot install the app there; the acknowledged browser fallback is available without forcing a browser move.
- Local privacy/terms now match duplicate-email rejection; immutable historical registration notices were not rewritten.
- Static-shell cache moves from v30 to v31, retaining existing all-tabs-close update behavior.

## Verification
- Regression coverage includes consent/cancel/Escape/back/repeat, persistence isolation, receipt loss, browser/installed offline readiness separation, blocked storage, existing backup and asynchronous dialog-close focus.
- Final `npm run check` passed: lint, verified build/artifact validation, 252/252 tests, generated Worker types and TypeScript (exit 0).
- The initial local Chromium probe was unavailable; independent synthetic browser review is described below.

## Still not implemented
Secure lost-receipt recovery remains a separate security/product design task. Use an original browser/app that still has access, or contact support for guidance; neither a Product ID, customer backup nor repeating same-email registration recovers identity/access. No promise of support recovery, private-mode detection, automatic migration or installation-based data safety is made.

## Independent browser review
Parent reviewer reports no blockers; 69 focused tests passed. Actual cloud Chromium via supported Sites preview verified checkbox default/disabled state; checked then Escape/Cancel/Back→Forward reset without unlocking; Return to backup focus; accepted risk plus unavailable registration remains locked; reload preserves browser choice without bypassing registration. The inspected index.html and install-first.js byte-matched this final candidate. Isolated `/fallback-review` synthetic preview avoided an older cached service worker on `/community`; preview stopped. This is not a production registration/install or real-device backup migration test.
