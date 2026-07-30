# Community Edition launch checklist

1. Apply the Supabase migration and deploy `register-community-business`.
2. Configure the allowed app origin and gateway rate limiting.
3. Connect the single welcome-email webhook.
4. Set the production registration endpoint and optional survey URL in `config.js`.
5. Review the draft Terms and Privacy Notice for Australian legal compliance.
6. Test registration, QR scanning, visits, redemption, backup and restore on one iPhone and one Android device.
7. Deploy over HTTPS and confirm offline reopening after the first visit.

Do not launch publicly while `registrationEndpoint` is blank. Public builds intentionally refuse unregistered Product ID creation.
