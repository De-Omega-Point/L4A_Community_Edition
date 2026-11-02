# Native/store releases paused

Owner decision: 17 October 2026. Focus is the Community Edition web/PWA for iPhone
and Android. Apple App Store and Google Play work is deferred.

Historical Android/iOS shells, icons and Git history are preserved. No tracked
native web bundle or store binary is carried into this migration. The former
Android CI job is disabled, and native dependencies are not in the web package.
The July unsigned AAB is not a current release candidate.

Before resuming: reconcile native packaging with the current Community source,
review dependency and SDK requirements, perform real-device tests, establish
store accounts and signing under owner control, and obtain explicit submission
and legal-agreement approval. Do not create or commit signing secrets.

The prior build instructions remain in Git history at commit
b7285c45e5e27a1be0c634a4d0a8f1831be70880. They are not current instructions.
