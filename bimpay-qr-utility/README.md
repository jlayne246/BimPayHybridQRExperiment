# BiMPay QR Utility

Standalone browser-only QR generator extracted from the experimental QR lab for review. This is an independent build, not an official or certified Central Bank service.

## Run

Use Node.js 22.12+ (or a compatible newer release).

```sh
npm ci
npm run dev
```

## Static Hosting

```sh
npm run build
```

Publish the contents of `dist/` on any static HTTPS host. No API, database, account, server secrets, or environment variables are required. `base: "./"` supports deployment in a subdirectory. The build can be moved into a separate repository without the parent application.

## Behaviour

- Merchant/routing fields and QR rendering run in browser memory.
- Public Sans is bundled locally through Fontsource under the SIL Open Font License; the interface makes no requests to external font services. Exported template lettering is unchanged.
- No payment payloads are sent to an API or stored in browser storage.
- Six supplied SVG templates: Accepted Here, Donations, and Fixed Price in portrait and landscape. Landscape options automatically rotate the output dimensions for Original/A5/A4. Landscape Donations prints the cause beneath GIVE TO; Landscape Fixed Price uses the blank artwork for the description and generated price.
- Institution/branch presets transcribed from the supplied May 2026 branch transit directory. Party Name labels the institution selector and Address Line 1 labels the branch selector. Selection copies Head Office BIC to tags 26.01 and 26.02, and the five-digit Transit Code to 26.04. This is a configurable application mapping, not a QR specification established by the directory. All routing fields remain manually editable.
- Directory notes and discontinued rows are retained. Discontinued rows are visible but disabled; duplicate source rows have separate selector identities. The directory is a May 2026 snapshot, not a live registry.
- Original, A5, and A4 PNG output; print sizes preserve artwork proportions with white side margins. Print at the chosen paper size using fit-to-page. Pixel dimensions target 300 pixels per printed inch; PNG viewers may not infer paper size automatically.
- Fixed-price labels are snapshots of the generated QR amount.
- Descriptions and donation causes allow 30 characters.
- Reloading or clearing the form removes in-memory data. Downloaded/shared files contain the encoded recipient information.

The payload layout retains the prototype's `bb.org.cb.mpqr` GUI, `QRBB` scheme, observed tag-26 routing fields, and `***` variable-amount convention. Confirm these conventions and approved branding with the scheme owner before official adoption. The utility generates QR files; it does not process payments.

The original application remains in `../bimpay-hybrid-qr-prototype` and is unaffected by this extraction.
