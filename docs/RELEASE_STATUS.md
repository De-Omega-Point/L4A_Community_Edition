# Source consolidation / release status — 1 November 2026

## Provenance and preservation

The owner designated `De-Omega-Point/L4A_Community_Edition` the official Community
Edition repository. The review commit descends from its existing main commit
`8eddde209827b3234f3fe6ff76a6616e809adeab`; all three earlier commits remain intact.
The imported cumulative local `l4a-install-fallback` source follows the live v20
baseline `8d9632d1576c6acaba41d8c642038d4096a854aa`, with member dashboard, card,
self-service install and acknowledged browser fallback work. Earlier v16 source
reconciliation is documented for provenance, not claimed as the live version.

Root source is integrated in place, not duplicated into a second application.
The four July-only files removed from the current tree remain in Git history:
`app/api/register/route.ts`, `app/api/upgrade-interest/route.ts`,
`public/community/js/alerts.js`, `public/community/js/registration.js`.
These are superseded by gated registration and current dashboard behavior;
restoring legacy write routes would conflict with the current security model.
Existing fonts, branding, migration history and vendor license are preserved.

`marketing/` is a source snapshot from `De-Omega-Point/L4A_Landing` commit
`246d898c89be8b3b1b71c70cb2ef1e06f63574f7`, copied without its workflow.
The original repository, storefront links and live hosting remain unchanged.
Its source content may still describe older release behavior: do not publish it
as part of this import or assume it has been reconciled with the proposed app.

## Verification and safety

The cumulative candidate had 252/252 passing tests plus lint/build/artifact/type
checks. The import is rechecked separately; remote CI status is reported with the
review handoff, not assumed from earlier runs. Synthetic test emails are not real
registrations. A personal-address negative fixture was replaced with a reserved
test-domain address. No secrets, receipts, cookies, customer records, database
files, private notes, logs, dependencies or generated bundles are imported.

Source push is not release approval. This import does not run SQL or modify D1.
The latest live schema, runtime settings and owner boundary need fresh verification
before a separately approved deployment. Proposed email code/outbox SQL does not
activate sending. Lost-receipt recovery is not implemented; support guidance must
not promise recovery. No payment or store release is included.

## Release gates still open

- Physical iPhone/Safari and Android/Chrome installation and relaunch.
- Camera/scanner permissions, offline shell readiness and update behavior.
- Synthetic backup/export/restore and browser/installed data-isolation checks.
- Verified schema/runtime boundary and deployment approval before any live change.
- Explicit recovery design/authorization if recovery is to be implemented later.
