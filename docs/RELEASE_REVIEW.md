# Community Edition release review

## Provenance and scope

- Flagship source: Sites v13 / 6d54e07c4183a9fc6ceb1252ac5b215e27bbd127.
- Existing GitHub base: b7285c45e5e27a1be0c634a4d0a8f1831be70880.
- Preserve Git history and native shells, replace the obsolete web app with the
  current Community Edition. Keep the L4A_Landing storefront separate.
- Review branch only. No Sites publication or store submission is part of this change.

## Required merchant acceptance checks

Use synthetic customers only until these pass on the intended devices.

1. In a fresh browser, confirm app and direct script/manifest URLs require registration.
   Register with synthetic details and marketing unchecked; then set shop branding
   and reward rules. Confirm the server Product ID persists on reload.
2. Create a customer, find them manually, record visits, and redeem one reward.
3. Scan a QR code; then scan an invalid code and confirm no prior customer remains
   selected. Cancel/deny camera permission and use the manual fallback.
4. Reload and reopen after closing the browser. Confirm committed records remain.
5. Export a backup and restore it, including cancellation and invalid-file cases.
6. Exercise demo mode and restore real data; failure must not destroy the recovery copy.
7. Test unavailable/full storage and two open tabs. Failed or conflicting writes
   must be visible and must not double-credit or double-redeem.
8. Install via iPhone Safari and Android Chrome, load fully once, go offline and
   repeat the core flow. After initial registration, loss of network must not block cached core work.
9. Apply a worker update, close/reopen all app windows, verify the new shell and
   existing records. Check both narrow mobile and desktop layouts.
10. Verify registration against a test database, including repeated submission,
    aborted responses, disabled cookies, database outage and concurrent requests.
    Marketing is optional, no email is sent, and public IDs cannot recover access
    or alter contact details. Preserve all legacy records. Confirm first app-open,
    install-request and supported install-observed events remain distinct.
12. Owner list must stay closed until the actual Sites owner identity and header
    trust boundary are verified. Test signed-out, non-owner and forged-header
    requests at every exposed origin; only the configured owner may see PII.
    Check pagination and escaping with synthetic records.
11. On Counter and Customers, start a note for Alex, then select Blair (also try
    Clear/New first). The unfinished note must clear, never save to Blair.
    The field names its owner and explains the clear-on-customer-change behavior.
    Same-customer redraws and screen navigation must retain the draft. While a
    note save is delayed, type a newer draft, including identical text after
    editing or switching away/back. Completion must not erase that newer draft;
    repeated clicks must not duplicate a note. Failed saves must retain the
    current draft and identify the original customer in the error.

## Explicit non-claims

Browser/mobile interactive testing is blocked in the current execution environment.
No device installation, camera permission, real registration, email delivery,
store signing, payment, deployment or store listing is certified by local tests.
Automated test counts and exact CI commit will be recorded in the review PR.

## Registration candidate

See `REGISTRATION_CANDIDATE.md`. The additive SQL is prepared as migration
`0003_yellow_nightshade.sql`, with existing migrations unchanged. Production schema, secure owner configuration and device acceptance
are pending; a merge alone must not be treated as deployment approval.

Protected Community assets are embedded in the Worker and excluded from the
public static archive. The build validator rejects protected public files,
including stale output. Worker-first asset routing is defense in depth, not the
security boundary. Tests compare each protected response to its source bytes,
check MIME types, HEAD and encoded/extensionless aliases, and prove no protected
request falls back to the public asset binding. A fresh-browser live check is
still required, since already-downloaded offline shells remain usable by design.
