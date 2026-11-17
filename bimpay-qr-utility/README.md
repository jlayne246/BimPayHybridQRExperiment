# BiMPay QR Utility

Standalone browser-only QR generator extracted from the experimental QR lab for review. This is an independent build, not an official or certified Central Bank service.

## Run

Use Node.js 22.12+ (or a compatible newer release). Run from the repository root.

```sh
npm ci
npm run dev
```

## Static Hosting

```sh
npm run build # from repository root
```

Publish the contents of `bimpay-qr-utility/dist/` on any static HTTPS host. No API, database, account, server secrets, or environment variables are required. `base: "./"` supports deployment in a subdirectory. The built static files can be hosted independently; source builds now use the two sibling workspace packages.

## Behaviour

- The default page uses merchant-friendly labels for business details, receiving account, payment amount, and printing/sharing. Open `#/customise` using **Customise / Experiment** for the detailed QR fields and payload inspection; **Back to QR creator** returns to the simple form. Both views share in-memory values, and hash routes work on static hosts without routing rewrites.
- Merchant City is locked to `BRIDGETOWN` and hidden on the merchant page. Payload format, initiation method, GUI, scheme, and automatic generation timestamp remain locked in both views.
- Recipient type controls the simplified form: Individual / microbusiness uses name/trading-name and receiving-account labels; Small / medium business (default) uses business labels; both offer optional invoice/reference/notes. Large business additionally offers contact, store, loyalty, customer, and till references. Hidden details are preserved in memory but omitted from simplified-page QR generation. Customise / Experiment exposes the full additional-data set for deliberate testing.
- Category is selectable for all recipient types. Individual / microbusiness does not imply money transfer or force `4829`; select a category appropriate to the activity.
- Charity / non-profit / social organisation uses organisation/supporter labels, optional purpose/reference, and shows an explicit charitable-donation checkbox. Organisation identity alone does not select donation mode. Enabling donations selects the Donations template while preserving orientation. Its category remains selectable; no universal charity classification is assumed. Invoice, loyalty, customer, location and terminal fields are omitted from simplified-page generation for this type.
- Merchant/routing fields and QR rendering run in browser memory.
- Public Sans is bundled locally for the interface. Montserrat is bundled locally for generated portrait cause, description, and price labels to match the v2 SVG artwork; landscape labels retain Arial. Both fonts are distributed through Fontsource under the SIL Open Font License, without external font-service requests.
- No payment payloads are sent to an API or stored in browser storage.
- Eight supplied SVG templates: Accepted Here, Merchant Name, Donations, and Fixed Price in portrait and landscape. Landscape options automatically rotate the output dimensions for Original/A5/A4. Set-price mode automatically selects and locks Fixed Price while keeping orientation selectable; variable-amount mode omits Fixed Price from the template list. Fixed Price displays the uppercase merchant name, optional description, and generated price.
- Optional local PNG/JPEG/WebP logo uploads up to 2 MB appear in the QR centre in previews, shared images, and PNG/PDF exports. Uploads are trimmed of transparent/near-white outer padding and normalised to at most 1024 pixels. Logo QRs use high error correction and preserve the logo's aspect ratio. Wide/tall logos can reach 32% on their longest side; square logos reach 19%. The rounded white backing has a 1.5%-of-QR margin on every side and a covered-area cap equivalent to a 22% square. Changing/removing a logo clears the previous QR until regenerated. Test exported codes with the intended payment apps and print sizes before use; error correction does not guarantee every scanner will accept a branded QR.
- Institution/branch presets transcribed from the supplied May 2026 branch transit directory. Party Name labels the institution selector and Address Line 1 labels the branch selector. Selection copies Head Office BIC to tags 26.01 and 26.02, and the five-digit Transit Code to 26.04. This is a configurable application mapping, not a QR specification established by the directory. All routing fields remain manually editable.
- Directory notes and discontinued rows are retained. Discontinued rows are visible but disabled; duplicate source rows have separate selector identities. The directory is a May 2026 snapshot, not a live registry.
- Original, A5, and A4 PNG output; print sizes preserve artwork proportions with white side margins. Print at the chosen paper size using fit-to-page. Pixel dimensions target 300 pixels per printed inch; PNG viewers may not infer paper size automatically.
- PDF download embeds the same high-resolution artwork in a single page. A4/A5 use exact physical paper dimensions in the selected orientation; Original uses the SVG's original physical dimensions (approximately 100 x 150 mm portrait). All PDF generation runs in the browser, and the PDF library is loaded only when PDF export is requested. Print PDFs at actual size on matching paper.
- Fixed-price labels are snapshots of the generated QR amount.
- Descriptions and donation causes allow 30 characters.
- Reloading or clearing the form removes in-memory data. Downloaded/shared files contain the encoded recipient information.

The payload layout retains the prototype's `bb.org.cb.mpqr` GUI, `QRBB` scheme, observed tag-26 routing fields, and `***` variable-amount convention. Confirm these conventions and approved branding with the scheme owner before official adoption. The utility generates QR files; it does not process payments.

The original application remains in `../bimpay-hybrid-qr-prototype` and is unaffected by this extraction.


## Workspace architecture

The repository root manages `packages/bimpay-qr-generator`, `packages/bimpay-payment-cards`, and this utility with npm workspaces and one root lockfile. The original `bimpay-hybrid-qr-prototype` remains outside these workspaces and is unchanged.

- [QR generator](../packages/bimpay-qr-generator/README.md): pure TLV/CRC and high-level payload API; separate browser QR/logo rendering.
- [Payment cards](../packages/bimpay-payment-cards/README.md): eight bundled SVG templates, local export fonts, Canvas PNG and lazy PDF export. Accepts an existing QR image without a QR-generator dependency.
- This React app owns inputs, banking directory, recipient/donation choices, validation feedback, fingerprints, request IDs, preview state, downloads and sharing. It prepares print-resolution QR images before calling the card library.

From the repository root:

```sh
npm ci
npm run build # builds both packages, then the Vite utility
npm test # Vitest package and React integration tests
npm run test:browser # actual Chromium PNG/PDF exports
```

Browser tests default to `/usr/bin/chromium`; set `CHROMIUM_PATH` to another Chromium executable if necessary. Package builds/tests can run separately with `npm run build -w <package-name>` and `npm test -w <package-name>`. Build packages before running `npm run dev -w bimpay-qr-utility`; root `npm run dev` does that automatically. Do not run a separate `npm ci` inside the utility.

Both packages are private ESM libraries with declarations and no React/Vite runtime dependency. See their READMEs for APIs, packed-archive installation in other applications, asset handling, and browser requirements. Nothing is published to npm.

The stale-QR safeguard remains based on encoded payment fields, private GUI and QR logo, excluding generated timestamps and flyer-only settings. Changed payment data or logos disable stale previews/exports until regeneration. Generation request IDs prevent older completions or errors from replacing newer state; clearing the form invalidates pending requests. Async PNG/PDF/sharing work also rechecks freshness before delivering a file. Fixed-price display labels are captured with the successfully generated payload.

The repository is an independently developed experimental utility. The generator is not an officially certified implementation and does not guarantee compatibility with all payment applications. The software does not execute or process payments. Official use of BiMPay branding or scheme-specific functionality may require authorisation. No institutional endorsement is claimed.

See [refactor notes](../docs/PACKAGE_EXTRACTION.md) for compatibility decisions, validation and the small necessary defect fixes.
