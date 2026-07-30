# Loyalty for All — Community Edition

Free-forever, local-first loyalty and lightweight customer management for independent small businesses.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

Local preview registration creates a development Product ID. Production registration requires the endpoint described in [docs/REGISTRATION_API.md](docs/REGISTRATION_API.md).

The repository includes a Supabase migration and Edge Function for the production business registry and Product ID issuer. Configure the function URL in `config.js` before public deployment.

## Product boundaries

Read [COMMUNITY_EDITION_SCOPE.md](COMMUNITY_EDITION_SCOPE.md) before adding features.

## Data model

Customer records are stored in browser local storage. Businesses can download JSON backups and CSV exports. No customer record is automatically sent to De-Omega-Point.

## Browser requirements

- Current Chrome, Edge, Firefox or Safari
- HTTPS or localhost for camera access and PWA installation
- Camera QR decoding is strongest in browsers supporting `BarcodeDetector`; manual customer-code entry remains available

## Release verification

Run:

```bash
npm test
```

Then verify registration, customer creation, QR scanning, visit recording, reward redemption and backup/restore in a browser.
