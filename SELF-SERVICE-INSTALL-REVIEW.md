> Historical candidate review; current status is in docs/RELEASE_STATUS.md.

# Self-service installation — local review candidate

Base: preserved `l4a-members-dashboard` candidate (234 passing tests). This copy is local-only; nothing pushed or deployed.

## Findings and changes

- The app already had a genuine `beforeinstallprompt` path, standalone manifest, correctly scoped `./` start URL, icons and versioned offline shell. These were not a native download installer.
- The manifest is registration-protected, but its HTML link lacked `crossorigin="use-credentials"`. Added this so browser manifest requests include the existing same-origin receipt cookie. The registration gate remains unchanged.
- Extracted a testable browser install controller. A supported browser's offered prompt runs directly on the customer's click. Buttons guard repeated clicks, and an open help dialog gains a genuine Install app action if the browser makes one available.
- Acceptance alone is not success. Only a trusted `appinstalled` event hides the banner; accepted, dismissed and failed prompts show honest status. Prompt failures do not automatically open an instruction dialog. No installed flag or registration state is written.
- Pending and observed installation labels survive manual device-guide changes and rerenders.
- Unsupported/no-prompt buttons explicitly say Installation help. Existing device-specific steps and receipt/backup cautions remain intact.
- Offline shell bumped from v29 to v30 and includes the new module. Existing sessions are not forcibly replaced.

## Browser boundaries

Chrome/Edge-compatible contexts may expose the real in-page installation prompt when browser criteria are satisfied. It cannot be forced or silently accepted. Safari uses user-controlled Add to Dock / Add to Home Screen. Firefox Mac currently has no built-in web-app installation (Firefox's desktop feature is Windows-only). A downloadable signed Mac application is a separate native distribution project, not something JavaScript can produce by changing a button.

Registration receipts and customer records must not be assumed to transfer between browsers or installed contexts. This candidate does not change receipt recovery, duplicate-email checks, registration, backup, database, authentication or storage. Existing missing-receipt users should contact support rather than register again.

## Verification

Automated: `npm run check` (lint, verified build/artifact checks, all tests, generated Worker types and TypeScript). See sibling `self-service-install-check.txt` for final run.

Browser: local static preview only, without production registration. Verified initial setup, explicit Installation help, manually selected Firefox Mac unsupported route, and close returning to unchanged locked setup. The cloud browser did not offer a native install prompt in this observation; actual OS installation and receipt continuity in a freshly installed app are **not** verified. Native lifecycle tested with deterministic mocked browser events, not represented as an OS test.

## Official references (checked 2026-10-31)

- https://web.dev/articles/install-criteria
- https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent/prompt
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/crossorigin
- https://support.mozilla.org/en-US/kb/web-apps-firefox-windows
- https://support.apple.com/en-gb/104996

Recommend keeping the existing PWA scope and testing a registered supported-browser install before any release. If installing directly while remaining in Firefox Mac is a requirement, obtain agreement on a signed native installer and its separate delivery/maintenance scope first.
