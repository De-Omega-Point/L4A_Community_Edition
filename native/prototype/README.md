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
the local landing and exact existing HTTPS host. Desktop new windows, file downloads
and permissions (including camera) are denied. Tauri does not support the
new-window callback on Android; Android popup/download behavior remains unverified and
requires native-device acceptance before release. These restrictions intentionally
mean backup/export/scanning and full native usability are NOT accepted yet.
Offline cold start is not promised. The live browser/PWA remains unchanged.

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
The parent `native/README.md` records a future activation design proposal; that
design is NOT implemented and the prototype does not claim to solve it.

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
