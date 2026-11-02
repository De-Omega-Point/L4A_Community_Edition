# Registration-first candidate (unpublished)

## One visitor flow and one list

`/register` → minimal individual/business form → stored server Product ID →
`/community/`. D1 is the only authoritative new registration store. No spreadsheet,
exports, login provider, email delivery, new service or paid subscription is added.
Existing hosting/database billing and quotas still need checking before launch;
this is not a guarantee of zero total operating cost.
Names and emails are claimed, not verified. A saved registration is not a unique
verified person/business or proof of installation.

The optional marketing checkbox starts unchecked. Required terms/privacy
acknowledgements are separate. The form links to versioned notices under
`/registration/notices/`, outside the old `/community/` service-worker scope,
so a cached old notice cannot be acknowledged as the new version. Server timestamps and notice version
`2026-10-17-registration-1` are recorded. Customer loyalty records never accompany
registration. Existing device-local IDs are retained as **local workspace IDs**,
separate from the new public UUID Product ID.

## Access boundary

- JavaScript `crypto.randomUUID()` executes on the server. D1's primary key and
  bounded collision retry protect Product ID uniqueness.
- A distinct 32-byte cryptographic receipt is sent only in a Secure, HttpOnly,
  SameSite=Lax, host-only cookie. Only its SHA-256 hash is stored in D1.
- Browser JavaScript receives a public Product ID, never the receipt. No API key,
  provider credential, localStorage auth flag, password or signing secret exists.
- The cookie lasts up to one year. Repeating a request using the same receipt
  returns the original ID and never overwrites contact information or consent.
- A cleared/expired cookie or different browser does not regain access by email
  or public Product ID. New registrations are conditionally inserted only when
  the normalized email is not already present. Matching never links a receipt,
  returns another registration, overwrites details or merges old duplicate rows.
  Support must resolve missing-receipt cases; there is no automated verified
  recovery service. The form is not a verified-account system.
- The atomic INSERT guard protects this registration code path, not arbitrary
  database writers. No email-unique index or migration is applied. Existing
  duplicate rows and their legitimate receipts continue to work. Comparison
  trims and lowercases; provider-specific plus/dot alias folding is not used.
  The lookup scans existing email values without a supporting normalized index.
- This is one new registration per normalized email, including shared business
  addresses and additional devices. Emails are unverified: typo/first-claim
  reservations can block rightful users. No rate limiter or email-lookup endpoint
  is added. Generic refusal reveals no row/ID/contact details, but success versus
  refusal can still expose address availability. These limits require owner
  acceptance before publication.
- Mutations require same-origin JSON, a valid receipt cookie and a streamed
  4096-byte body limit. Validation rejects customer records and extra fields.
- App HTML, JavaScript, manifest and service worker are bundled inside the Worker,
  absent from the public static archive, and require a database-backed receipt.
  Public legal pages, their CSS and branding images remain accessible before
  consent. Hosting does not need to support Worker-first asset routing.
- Canonicalized paths are used both for authorization and dispatch. Image
  optimization cannot proxy protected app files. Protected responses are private
  and no-store at HTTP caches. Tests cover aliases, encoded paths and DB failures.
- This is an acquisition gate, not DRM or identity proof. Someone can submit
  invented details, and software already downloaded cannot be locked later.
  Previously cached v13 remains usable; the new complete cached shell supports
  offline work. A service worker cache is intentionally not an account boundary.

## Private owner list

`/owner/registrations` renders a paginated table server-side, without exposing
receipt hashes. It escapes saved content and uses private/no-store responses.
It is **closed by default**, including preview and the current proposed build.

The supported Sites dispatch identity is `oai-authenticated-user-id`, not email.
Before any production configuration, verify that this header is supplied only by
Sites, client-spoofed values are stripped, and there is no alternate public Worker
origin. Determine the actual owner's stable Site ID through that trusted flow.
Only then may approved runtime configuration set:

- `REGISTRATION_OWNER_SITE_USER_ID`: the verified owner's exact stable Site ID.
- `REGISTRATION_OWNER_ACCESS_READY`: `confirmed` after the boundary test passes.

No real owner ID/configuration has been created, inferred from a display name,
put in source, or set in production. Missing configuration returns 503 before any
private database query. Anonymous requests need Sites sign-in; other authenticated
users receive 403. Synthetic header tests verify the application decision only,
not the hosting platform's live authentication guarantee. If the trusted boundary
cannot be established, leave the owner list closed and report setup as blocked.

## Bounded acquisition observations

The same row can record the first `app_opened`, `install_requested` and
`install_observed` timestamp. Only an actual browser `appinstalled` event causes
the last observation; accepting a prompt is not treated as completed installation.
Offline/unsupported events are not queued. Client reports can be omitted or
forged and must not be presented as verified download counts. No third-party
analytics, IP address, user-agent or customer data is added to this register.

## Migration and release prerequisites

1. Review the privacy/terms draft and retention/support handling with the owner.
   No campaign, email delivery or automated preference-changing service is enabled.
2. Review `drizzle/0003_yellow_nightshade.sql` and its Drizzle metadata. It adds one
   new table with uniqueness and date indexes, changes no existing tables, and
   is packaged for Sites migration before Worker upload. Obtain explicit approval
   before production deployment; check and preserve existing records first.
   The original proposal remains in `docs/proposals/` for comparison.
3. Preserve existing membership rows, local IDs and merchant backups. The old
   membership form is retired in this candidate and its Worker endpoint returns
   410 rather than writing a second new registration list. The legacy module remains for historical compatibility tests; the route itself
   is also retired as defense in depth, without a database dependency.
4. Verify production packaging contains no protected app files in `dist/client`.
   The `protectedCommunityAssets` Vite plugin stages only public legal/CSS/branding
   files and embeds all other Community files in a Worker-only virtual module.
   The Worker serves those bytes only after the D1 receipt check, with private,
   no-store responses. `assets.run_worker_first` is defense in depth, not required
   for this boundary. The artifact validator fails if any protected file remains
   in the public archive. Check direct assets, aliases, redirects and image proxy live.
5. With separate approval, verify/configure the owner boundary described above.
6. Test on iPhone Safari and Android Chrome: form/keyboard, blocked cookies,
   repeated/back/cancel actions, initial load/install, offline reload, cache update,
   data persistence, customer-note ownership, JSON backup and restore.
7. Obtain explicit merge/deployment approval. GitHub code is not a Sites release.

The SQL/API tests use synthetic SQLite and mocked D1 adapters; they do not prove
production D1 migration or browser acceptance. No production mutation, credential
creation, real registration, email, deployment or paid service is part of this PR.
