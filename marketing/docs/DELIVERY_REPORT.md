> Historical storefront report from the source repository; not a claim that this snapshot was deployed.

# Loyalty-4-All storefront registration-first candidate

Updated: 18 October 2026 (UTC)
Repository: https://github.com/De-Omega-Point/L4A_Landing
Base: published storefront commit `df3579f`
Status: local-only candidate; no commit, push or publication in this task

## Outcome

The main journey is landing page → free registration on the existing app host → optional browser installation or browser use → set up a reward and use it with customers. Every **Start using Loyalty4All** button and the public app URL configuration now points to `https://loyalty-for-all-community.sammielee.chatgpt.site/register`. **See how it works** remains the secondary action. The original seven-page structure, official logo, design and product-focused navigation are preserved, without pilot promotion.

Registration is required and free, with no password or payment. Marketing consent remains a separate, optional choice. App registrant contact details are stored privately in the app service's central database, separately from customer records held in the browser. The server-issued Product ID is a reference, not a password, verified identity or proof of paid access. The old on-device Product ID is now explained as a separate local workspace ID. Registration is not a backup or a cross-device recovery service.

The product website itself does not collect registrations. The legacy `checkout.html` remains optional feedback/support, not checkout or registration. Its composer still requires only a message and privacy acknowledgement; contact details remain optional. Visitors review and choose whether to send through their email service. The status page never confirms registration, delivery or paid access.

## Preserved safeguards

- All public app-entry links route to `/register`; legal-notice links remain public.
- Local customer data, backup responsibilities and absence of automatic multi-device synchronisation remain explicit.
- Browser installation is optional after registration. Google Play, App Store, APK and ZIP releases remain paused; no native-download or verified-install claims are introduced.
- Online payments and paid entitlements remain unavailable. Legacy URLs cannot recreate retired payment or access behaviours.
- CSP still blocks background connections and native form submission. No feedback personal data is stored in localStorage/sessionStorage or this website's URLs.
- Existing email, clipboard, text-file and legacy-storage safeguards remain unchanged.
- The full-release manifest comparison, request/body timeouts and overall deadline remain intact.

## Validation of this candidate

- `npm run check`: 47 passing tests, seven HTML pages and 114 local references.
- Added regression coverage rejects app-entry bypass links and obsolete no-registration promises; verifies registration-first steps, separate optional marketing, Product ID/workspace ID language, private registration versus local customer data, and browser-only installation guidance.
- Updated `scripts/check-app.mjs` for the new app contract. Offline fixture tests cover the expected public registration page, gated app navigation/assets, invalid/forbidden submissions, optional unchecked marketing, old-flow/bypass rejection and service-readiness failures. Its POST bodies contain no details or consent and cannot create a valid registration. Public legal/brand assets may follow at most three manual same-origin redirects; unsafe targets, loops and missing destinations fail. Registration and protected app checks remain strict, with redirect regression tests.
- JavaScript syntax, HTML IDs/labels/landmarks and Git whitespace checks pass locally.
- Interactive browser/mobile rendering, actual installation, valid production registration/database insertion and mailbox delivery were not tested in this storefront task.
- No live app probe, form submission, email, app change, commit, push or publication was performed in this local-only task.

## Coordinated release gate

Publish and verify the separately reviewed registration-first app before publishing this storefront. The currently published app's old optional-registration behaviour is not an acceptable match for this candidate, and the updated live probe is intentionally expected to reject that old flow. Run it after app deployment, then require matching-commit CI and public storefront byte verification. A local passing test suite alone does not establish live registration persistence or successful publication.

Before acquisition campaigns, confirm the support mailbox is monitored and can receive messages. Paid launch remains gated on approved prices/terms, a trusted payment and entitlement backend, authenticated operators and approved downloadable releases. None of those services is activated by this storefront change.

