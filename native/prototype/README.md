# Actual native build prototype — not a customer release

Authorized no-cost build experiment, 1 November 2026. Tauri CLI 2.12.4, core
2.12.5 and build 2.7.4 are pinned. Both npm and Cargo locks are committed. The Cargo lock was independently
identical in successful Mac and Windows builds; every build exports its lock
beside the binaries for exact dependency evidence. No web
source or registration backend is bundled, replaced or bypassed.

The native executable starts on a bundled **TEST ONLY** explanation. Clicking
its sole link loads the existing hosted HTTPS app in a separate persistent
profile. A new business may register there; an existing browser receipt and data
do not transfer. No lost-receipt recovery is added. Use synthetic records only.
Community Edition remains free forever, with no expiry/timed trial.

No native commands/plugins or remote capabilities. Navigation is restricted to
the local landing and exact existing HTTPS host. Desktop new windows and device
permissions (including camera) remain denied, as do all WebView-managed disk
downloads. Windows now has a narrow content-only export transport: a bounded
backup/CSV payload, native Save As confirmation, exclusive new-file write and
byte verification. JavaScript cannot supply a filesystem path. See
[EXPORT-SAVE-REVIEW.md](EXPORT-SAVE-REVIEW.md) for the security boundary and limits.
The matching hosted JavaScript has not been published, so the review package
must not be treated as a working customer export release yet.

Mac download restrictions remain unchanged. Tauri does not support the new-window
callback on Android; Android popup/download behaviour remains unverified. Native
registration continuity, offline cold start and scanning remain unaccepted. The
live browser/PWA remains unchanged.
CI builds real unsigned `.dmg`, `.msi` and unsigned release `.apk` containers on
standard public-repo runners. It creates no keys, uses no secrets, has only
contents:read, never publishes a release, never merges or deploys. Android guards
remove default debug signing and reject debug/sign/key-generation tasks before
execution. No Android debug build is permitted. An unsigned APK is not normally
installable. Mac/Windows prototypes are not ordinary customer downloads; do not
provide operating-system warning bypass instructions.

Build evidence includes byte counts, SHA256, source commit/run, Cargo lock and
clear unverified device/continuity/offline flags. Container magic checks establish
format only, NOT installability, platform signing or functional acceptance.
Artifacts have seven-day retention. They are test evidence in a public repository,
not private files. Website manifest stays unavailable until customer release gates
are actually met. No extra paid services or signing credentials are introduced.

Commands: `npm ci --ignore-scripts`, `npm test`, then platform-specific workflow.
Registration transfer is NOT implemented and the prototype does not claim to solve it.

## Explicitly requested package testing

CI now records read-only DMG verification, bundle/architecture and Gatekeeper
assessment. A refusal stops Mac launch testing; no protection is disabled or
quarantine removed. Windows smoke testing requires preexisting WebView2, installs
the MSI into a disposable runner directory, observes the process for eight
seconds, then stops/uninstalls only that app. Android APK testing checks ZIP,
manifest, ARM64 ELF library and absent signing; it does not install an unsigned
APK. Reports travel alongside exact package checksums. A process remaining alive
is **startup smoke only**, not registration/offline/backup/camera acceptance.
No real customer records or production registration submission are used.

## Controlled Windows export tests

An explicitly feature-gated separate `l4a-export-smoke` executable tests synthetic
exports through the same native handler and OS dialog. It is built only after the
normal MSI has been packaged and is never included in that MSI. It permits a local
fixture origin only in this test build. Runtime reports distinguish actual save,
cancellation, no-overwrite failure, repeats, invalid/oversized input and delayed
timeout/navigation cases. Saved bytes are also passed to the production restore
validator; that is not a full interactive registered-app restore test.
