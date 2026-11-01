# Loyalty4All Community Edition

**Official Community Edition source repository:**
[De-Omega-Point/L4A_Community_Edition](https://github.com/De-Omega-Point/L4A_Community_Edition).

This review branch consolidates the complete web/PWA application and supporting
source documentation. It is a proposed source update, **not a live release**.
The main branch is unchanged until separately reviewed and merged.

## One application

The root is the Community Edition app: find or scan a customer, record a visit,
and give a reward. Customer records, notes, consent, visits and rewards remain
local to the merchant's browser/profile/origin. JSON backup/restore and CSV export
are merchant-controlled; local storage and installation are not backups.

- `app/`, `public/community/`: registration UI and local-first loyalty app.
- `worker/`, `server/`, `db/`, `drizzle/`: receipt-gated Worker backend, D1 schema
  and migration source. **No actual database or customer records are included.**
- `build/`, `scripts/`, `tests/`: build integration, verification and synthetic tests.
- `marketing/`: separately scoped storefront source snapshot, not another app.
- `docs/`: release status, review plans and explicitly marked historical documents.

## Run and verify

Use Node.js >=22.13.0 on Linux with curl, flock and GNU timeout.

```sh
npm run install:ci
npm run dev
# Before release:
npm run check
```

`check` runs lint, verified Worker build/artifact checks, all tests, generated
Worker runtime types and TypeScript. `npm run test:unit` runs browser-independent
checks. Runtime output, dependencies and generated artifacts stay ignored.
The included web workflow checks pull requests/main; it has no deployment step.
Native app-store builds are paused and the Android workflow is disabled.
Native shells/binaries are not included in this web source consolidation.

## Source is not hosting or data migration

Existing hosted app: https://loyalty-for-all-community.sammielee.chatgpt.site/community/

The last recorded live baseline is Sites v20, source
`8d9632d1576c6acaba41d8c642038d4096a854aa`. This branch carries the newer cumulative
252-test install-primary/browser-last candidate. A source commit does not make
that candidate live. The existing `.openai/hosting.json` identity and D1 binding
are preserved as source configuration, not recreated or applied here.

This import performs no deployment, DNS/Pages change, database migration,
credential creation, owner-access change, email activation or record transfer.
D1 migration files and proposed outbox SQL are source only; verify actual live
schema and obtain separate approval before any rollout. SQL in `docs/` is not
automatically applied. Never run migration examples against production casually.

Registration stores minimal self-reported contact details and a server Product
ID separately from merchant customer records. A hashed receipt gates app access;
a public Product ID is neither a password nor verified identity. Owner access
remains subject to its existing verified server-identity boundary.

## Proposed release and remaining checks

Installation is the primary recommendation; browser use is the last fallback,
requiring an unchecked risk acknowledgement and explicit acceptance. A local
choice flag cannot bypass the receipt gate. Firefox on Mac gets honest browser
fallback guidance instead of a nonexistent install action. App shell updates
retain the all-tabs-close behavior.

**Secure lost-receipt recovery is unavailable.** Use an original browser/app
that still has access, or contact support for guidance. A customer backup,
public Product ID or repeated same-email registration does not restore access.
Installation, switching browser or changing host does not move existing records.

Automated tests and synthetic browser review are not real-device acceptance.
Physical iPhone/Safari and Android/Chrome installation, camera/scanning, offline
relaunch, update handling, backup/export/restore and browser-to-installed data
behavior still require verification before release. No real customer data should
be used for those checks. See [release status](docs/RELEASE_STATUS.md).

Historical review documents preserve prior decisions, not current deployment
instructions. Where they conflict, this README and RELEASE_STATUS take priority.
