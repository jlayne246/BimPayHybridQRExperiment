# BiMPay Hybrid QR Experiment

This repository contains an independent, unofficial, test-only payment sandbox for exploring
EMV-style QR payloads, fictional payment scenarios, and wallet funding models.

The application lives in [`bimpay-hybrid-qr-prototype`](bimpay-hybrid-qr-prototype).

## Start Here

- [Application overview](bimpay-hybrid-qr-prototype/README.md)
- [User guide](bimpay-hybrid-qr-prototype/docs/USER_GUIDE.md)
- [Local setup and deployment](bimpay-hybrid-qr-prototype/docs/OPERATIONS.md)
- [Collaboration and permissions](bimpay-hybrid-qr-prototype/docs/COLLABORATION.md)
- [Architecture and data model](bimpay-hybrid-qr-prototype/docs/ARCHITECTURE.md)

Nothing in this project connects to real financial institutions or payment rails. Use only
fictional profiles, synthetic account references, and test data.

## QR Utility and reusable packages

The browser utility in [`bimpay-qr-utility`](bimpay-qr-utility/README.md) now consumes two private npm workspace packages:

- [`bimpay-qr-generator`](packages/bimpay-qr-generator/README.md): experimental payload construction, validation, QR images and logo preparation.
- [`bimpay-payment-cards`](packages/bimpay-payment-cards/README.md): printable signage from an independently supplied QR image; bundled templates/fonts and PNG/PDF output.

Run `npm ci`, `npm run build`, `npm test` or `npm run dev` from this repository root. The original prototype above is outside the workspace and retains its own setup. See [extraction notes](docs/PACKAGE_EXTRACTION.md) for architecture and compatibility decisions.

These independently developed experimental utilities are not an officially certified BiMPay implementation, do not guarantee compatibility with every payment app, and do not execute or process payments. Official branding or scheme-specific use may require authorisation. No institutional endorsement is claimed.
