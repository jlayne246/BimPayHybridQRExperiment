# Payment-card example

`payment-card-example.png` is a 240 × 360 thumbnail rendered from the bundled `bimpay-accepted` template using `bimpay-payment-cards`. Its QR encodes the plain text `EXAMPLE ONLY - NOT A PAYMENT QR`; it contains no recipient, account, routing or payment payload. It illustrates the optional card editor and is labelled “Example only” in the UI. Actual previews and exports always use the user's current generated QR.

The artwork retains the existing project's branding limitations; this example does not imply scheme certification or institutional endorsement.

## Default QR centre logo

`bimpay-qr-logo.png` is the user-supplied transparent BiMPay mark, preserved unchanged. The utility uses it by default and restores it when clearing the form. Consumers of the independent QR-generation package still choose their own logo; the library has no dependency on this app asset. The existing renderer uses H error correction for branded QRs and preserves the logo's aspect ratio and covered-area budget.
