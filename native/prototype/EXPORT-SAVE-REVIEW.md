# Controlled Windows export review

Status: review implementation, not a public release. No live website change, registration/auth change, key creation or paid service.

## Boundary

Windows exports use a small **content-only custom transport**, not a filesystem command API. There are still no Tauri invoke handlers, plugins, remote filesystem capabilities or arbitrary JS-provided paths. Every built-in WebView disk download is denied. A matching same-origin Blob request lets Rust read one bounded pending payload from an immutable, closure-backed mailbox. This avoids downloading an unbounded remote resource into a staging file.

Rust independently checks the exact page and Blob origin, request token, 20 MB UTF-8 byte limit, file extension and backup/CSV structure. It then presents the native Save As dialog. The page never supplies or receives the destination. Only JSON Community backup or the existing customer CSV format is accepted. Network/device paths and NTFS alternate streams are rejected. New file creation is exclusive and atomic; existing files are never overwritten. Windows sharing is denied while writing. A successful result requires write, flush and same-handle byte-for-byte readback.

A failed/interrupted write may leave an incomplete new file. No success or backup timestamp is recorded for it. It is not deleted by pathname after handle close because another process could have replaced that path. Choose a new name on retry. The app never automatically opens exported files.

One export can be pending. Native navigation is refused during processing. Generation and exact current URL checks protect receipt/commit/result against stale pages. Expired operations do not commit after a long-open dialog. Missing native evaluation callbacks release the pending lock. The browser transport times out as unconfirmed, never saved. If native has already taken the payload, its single-flight lock remains until the OS dialog is closed, so a timeout cannot silently start a second save. File selection is user intent; a Blob origin or filename alone is not treated as consent.

## Honest UI and limits

The updated helper waits for the matching native result. Only `saved` records a backup timestamp. Cancelled, failed, busy and unconfirmed paths cannot do so. Ordinary browsers report only `requested`; there is no browser API here to verify completion. Historical stored backup timestamps are preserved and labelled Previously requested, unverified. A separate matching verification marker distinguishes new native saves; old timestamps are not proof that a file exists.

The mailbox is not a defence against fully compromised first-party JavaScript: such code could forge its own UI or inspect its own token. Rust's independent validation, native confirmation and exclusive write remain the actual filesystem security boundary. This transport cannot grant read access, arbitrary paths, command execution or automatic opening.

## Delivery coordination

The normal native package still opens the hosted L4A site. That site currently serves older JavaScript. Updating this review branch alone does **not** fix the live site's completion message. The native shell and matching public/community/js helper/status changes need separately approved coordinated publication. Until then the package remains TEST ONLY. A feature-gated, separate smoke executable exercises synthetic exports locally; it is not included in the customer MSI.

Mac downloads remain denied and trusted signing is deferred. Android remains unsigned. Existing registration transfer and offline cold start remain unresolved. No backup fix removes those release gates.

## Checks

See scripts/export-mailbox.test.mjs for correlation, stale/forged completion, timeout, repeat, subframe and size tests; export_policy.rs for payload/name/size and no-overwrite tests; tests/data-safety.test.mjs for no false backup success. Windows smoke evidence must establish actual WebView Blob callback, native Save As, cancel, failure and saved bytes. Unit tests alone are not device acceptance.
