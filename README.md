# Loyalty-4-All Community Edition

The flagship local-first loyalty app for independent businesses. The core flow is
find or scan a customer → record a visit → give a reward.

## Release scope

- Web/PWA on iPhone, Android, tablets and desktop browsers.
- Required self-reported registration before first online access to this candidate.
- No customer login provider, payment, email verification or cloud sync.
- Customer records, consent, notes, visits and rewards stay on the merchant's device.
- JSON backup/restore and CSV export are merchant-controlled. Back up regularly:
  device loss, private browsing and clearing browser data can remove local records.
- One registration form saves minimal contact details and a server Product ID.
  Marketing is optional and unchecked. It never sends local customer records.
- Apple App Store and Google Play releases are paused. Retained native shells are
  historical reference, not current store-ready builds.

## Source of truth

This repository, `De-Omega-Point/L-4-A-2Market`, is the flagship source of truth.
The separate `De-Omega-Point/L4A_Landing` repository remains the product storefront.
Sites is the existing prototype host, not a substitute source repository.

The Community source was retrieved from Sites version 13, commit
`6d54e07c4183a9fc6ceb1252ac5b215e27bbd127`. Migration retains GitHub history and
existing native assets. The working release adds safety fixes on top of that
source; it does not replace it with the older July native snapshot.

The existing public prototype is
https://loyalty-for-all-community.sammielee.chatgpt.site/community/ .
A GitHub commit or passing CI does not deploy changes there. Founder review and
explicit deployment approval are still required.

## Run and verify

Requires Node.js >=22.13.0 and Linux with curl, flock and GNU timeout for the
current build helpers. GitHub CI uses Node 22.

```sh
npm run install:ci
npm run test:unit
npm run dev
npm run check
```

- `test:unit`: browser-independent unit and contract tests, no live customer data.
- `lint`: source lint, excluding generated code and paused native shells.
- `typecheck`: generate exact Worker runtime types from the built config, then
  check the web app. Builds first when no artifact exists. Types stay ignored.
- `test`: build and validate the Worker artifact, then run all tests.
- `check`: lint, build/all tests, then generated Worker types and TypeScript.
- `validate:artifact`: inspect an existing build's manifest and Worker entry point.

The install helper verifies the locked Vinext tarball and runs one bounded
`npm ci`. Dependencies, caches, runtime state, generated bundles, signing material
and test data must not be committed.

## PWA installation and updates

Register and open the app over HTTPS. On iPhone use Safari's Share → Add to Home Screen; on
Android use the browser's Install/Add to Home Screen action. The app includes
manual guidance when the browser does not expose an install prompt.

After the complete app shell has been cached, core loyalty work can run offline.
Initial registration requires a network connection. Shell updates
wait for the previous version's open tabs to close so HTML and JavaScript are
not replaced independently during a merchant session. Close all Loyalty-4-All
tabs/windows and reopen to apply an available update.

Local data is per browser/profile/origin, not automatically synced across devices.
Changing the app's domain or moving from a browser to a native wrapper does not
move merchant records; export and restore a backup deliberately.

## Backend and privacy

The root and `/register` are public. The Worker checks a hashed registration
receipt before serving `/community/` HTML, scripts, manifest or service worker.
Only public legal pages, CSS and branding images bypass that check. Registration
is self-reported, not verified identity. A public Product ID cannot unlock access,
change contact details, or recover registration on another device.

The Vite build embeds protected Community files in the Worker and stages only
public files for `dist/client`. This keeps the gate effective on hosts that serve
static assets before Workers. `assets.run_worker_first` is defense in depth only.
`npm run validate:artifact` rejects a build containing protected public assets.

The single D1 register uses `/api/registrations`. The additive table migration is prepared in
`drizzle/0003_yellow_nightshade.sql` for deployment and has **not** yet been applied
to production. Production deployment requires the approved schema rollout.
Without the table/binding, the gate fails closed. Old membership records remain
untouched; the legacy write endpoint returns 410 in this Worker. No emails are
sent. Payments and paid entitlements are not implemented.

`/owner/registrations` is a private, server-rendered list, closed by default.
Before enabling it, verify the owner's stable Sites identity and that Sites
strips forged incoming identity headers with no alternate public Worker route.
A client-supplied email, Product ID or first visitor never grants ownership.
Do not configure owner access until that deployment boundary is verified.

See `docs/REGISTRATION_CANDIDATE.md` for deployment prerequisites, exact limits
and the review plan. This unpublished candidate needs founder approval before
schema changes, owner configuration or deployment.

## Deferred native projects

`android/`, `ios/`, resources and the historical Capacitor configuration are
retained from GitHub for a future native release. They are excluded from web
checks. Native dependencies and supported native build scripts are intentionally
not part of the current web package. The old Android workflow is disabled.

See `docs/STORE_RELEASE.md` for the deferred status. Do not submit the July unsigned
artifact or claim the old shells include this release. Resuming native work needs
current packaging, signing, real-device testing and store-account review.

## Verification limits and review

See `docs/RELEASE_REVIEW.md`. Automated checks are not a substitute for real
Safari/Chrome installation, camera, offline, backup and recovery tests.
