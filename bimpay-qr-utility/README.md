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

### Vercel

For the utility's existing Vercel project, keep Root Directory set to `bimpay-qr-utility`, Build Command `npm run build`, and Output Directory `dist`. Enable **Include source files outside of the Root Directory in the Build Step** so the sibling workspace packages are available. Install dependencies using the repository's root workspace lockfile; Vercel's npm workspace detection normally handles this automatically (an explicit install command is `npm --prefix .. ci`).

The utility's `prebuild` script builds both library packages before TypeScript checks or Vite run. This is required on clean deployments because package exports point to generated `dist/` JavaScript and declarations, which are not committed. Running `npm run build` from either the repository root or the utility directory now builds the packages first. The additional implicit-any errors seen when package declarations are absent are consequences of the unresolved imports.

## Public and protected review builds

Both Vercel projects can use the same repository, branch and `bimpay-qr-utility` root directory. Configure the build-time environment variable separately:

| Project | `VITE_ENABLE_DEBUG` | Behaviour |
| --- | --- | --- |
| Public | unset or `false` | No debug navigation, technical controls or QR logo row; `#/debug` and legacy `#/customise` are replaced with `#/` without clearing form data |
| Protected review | `true` | Debug navigation, both debug routes and QR logo controls enabled |

Only the exact lowercase string `true` enables debugging. The default is disabled, including local development. For local review, copy `.env.example` to `.env.local`, set `VITE_ENABLE_DEBUG=true`, and restart Vite. From the repository root you can also run:

```sh
VITE_ENABLE_DEBUG=true npm run dev
VITE_ENABLE_DEBUG=true npm run build
```

In each Vercel project's **Settings → Environment Variables**, set the flag for the applicable Production and Preview environments and redeploy. Set public environments to `false`; set the review project's environments to `true`. Protect the review project's entire deployment with Vercel Authentication (All Deployments). Changing the flag requires a rebuild: it is compiled into the JavaScript and is not a runtime password, secret, or user-authentication mechanism. Public bundles omit the debug-only interface; shared payload-generation code remains available because the normal app needs it.

A hidden hash alone is not access control, and the build flag does not identify authorised users. The separate review deployment must remain protected by the hosting provider. The original `bimpay-hybrid-qr-prototype` app is unaffected.

Verify browser behaviour with `npm run test:browser` for the default public build, or `VITE_ENABLE_DEBUG=true npm run test:browser -- --grep "debug build guard"` for review routing. Automated tests cover the initial hash, hash changes, legacy URLs, literal flag values, and QR freshness after a blocked navigation.

## Behaviour

- The default page uses merchant-friendly labels for business details, receiving account, payment amount, and printing/sharing. In a debug-enabled review build, open `#/debug` using **Debug QR Scheme** for the detailed QR fields and payload inspection; **Back to QR creator** returns to the simple form. The legacy `#/customise` URL remains supported only in debug-enabled builds. Public builds omit the button and block both routes. Both views share in-memory values, and hash routes work on static hosts without routing rewrites.
- Merchant City is locked to `BRIDGETOWN` and hidden on the merchant page. Payload format, initiation method, GUI, scheme, and automatic generation timestamp remain locked in both views.
- Recipient type controls the simplified form: Individual / microbusiness uses name/trading-name and receiving-account labels; Small / medium business (default) uses business labels; both offer optional invoice/reference/notes. Large business additionally offers contact, store, loyalty, customer, and till references. Hidden details are preserved in memory but omitted from simplified-page QR generation. Debug mode exposes the full additional-data set for deliberate testing.
- Category is selectable for all recipient types. Individual / microbusiness does not imply money transfer or force `4829`; select a category appropriate to the activity.
- Charity / non-profit / social organisation / individual cause uses organisation/supporter labels, optional purpose/reference, and shows an explicit charitable-donation checkbox. Organisation identity alone does not select donation mode. Enabling donations selects the Donations template while preserving orientation. Its category remains selectable; no universal charity classification is assumed. Invoice, loyalty, customer, location and terminal fields are omitted from simplified-page generation for this type.
- Merchant/routing fields and QR rendering run in browser memory.
- Public Sans is bundled locally for the interface. Montserrat is bundled locally for generated portrait cause, description, and price labels to match the v2 SVG artwork; landscape labels retain Arial. Both fonts are distributed through Fontsource under the SIL Open Font License, without external font-service requests.
- No payment payloads are sent to an API or stored in browser storage.
- Eight supplied SVG templates: Accepted Here, Merchant Name, Donations, and Fixed Price in portrait and landscape. Landscape options automatically rotate the output dimensions for Original/A5/A4. Set-price mode automatically selects and locks Fixed Price while keeping orientation selectable; variable-amount mode omits Fixed Price from the template list. Fixed Price displays the uppercase merchant name, optional description, and generated price.
- The bundled `src/assets/bimpay-qr-logo.png` is the default centre logo in standalone QR previews, enlarged views, shared images and payment-card PNG/PDF exports. The QR logo row (upload, remove and restore controls) is shown only when `VITE_ENABLE_DEBUG=true`; public builds always use the default logo. In debug-enabled builds, **Remove Logo** selects a plain QR; **Use BiMPay Logo** restores the bundled image. Clearing the form restores the default. Optional local PNG/JPEG/WebP logo uploads up to 2 MB can replace it. Uploads are trimmed of transparent/near-white outer padding and normalised to at most 1024 pixels. Logo QRs use high error correction and preserve the logo's aspect ratio. Wide/tall logos can reach 32% on their longest side; square logos reach 19%. The rounded white backing has a 1.5%-of-QR margin on every side and a covered-area cap equivalent to a 22% square. Changing, restoring or removing a logo makes the previous QR stale until regenerated. Test exported codes with the intended payment apps and print sizes before use; error correction does not guarantee every scanner will accept a branded QR.
- Institution/branch presets transcribed from the supplied May 2026 branch transit directory. Party Name labels the institution selector and Address Line 1 labels the branch selector. Selection copies Head Office BIC to tags 26.01 and 26.02, and the five-digit Transit Code to 26.04. This is a configurable application mapping, not a QR specification established by the directory. All routing fields remain manually editable.
- Directory notes and discontinued rows are retained. Discontinued rows are visible but disabled; duplicate source rows have separate selector identities. The directory is a May 2026 snapshot, not a live registry.
- Original, A5, and A4 PNG output; print sizes preserve artwork proportions with white side margins. Print at the chosen paper size using fit-to-page. Pixel dimensions target 300 pixels per printed inch; PNG viewers may not infer paper size automatically.
- PDF download embeds the same high-resolution artwork in a single page. A4/A5 use exact physical paper dimensions in the selected orientation; Original uses the SVG's original physical dimensions (approximately 100 x 150 mm portrait). All PDF generation runs in the browser, and the PDF library is loaded only when PDF export is requested. Print PDFs at actual size on matching paper.
- **Print and Share** follows the same QR-first flow on mobile and desktop. Successful QR generation reveals **QR Code** and gently scrolls to it on mobile (respecting reduced-motion preferences); failed generation does not change output visibility. Neither output is collapsible. The **Create a Payment Card** button beneath the QR uses the bundled Accepted Here example thumbnail, labelled **Example only**, and reveals the inline card editor. Card previews render only after this explicit request. The button then becomes **Edit Payment Card**, which returns focus to the visible editor with settings preserved. Resizing does not hide either output. Clearing the form hides both outputs and the optional editor.

- **Printable QR preview** provides its own **Download as PNG**, **Download as PDF**, and **Share QR** controls. PNG output is 2048 × 2048 pixels; QR-only PDFs are 100 × 100 mm square pages, including the quiet zone. Sharing uses the PNG, or downloads it when file sharing is unavailable. Select the QR to open the larger dialog, which also provides a PNG download and closes with Close or Escape. Stale payment details disable exports and close the dialog; pending image/PDF/sharing work rechecks freshness before delivery. Flyer-only settings keep the QR valid. PDF code remains lazy-loaded. The optional card editor keeps its template, orientation, paper size and text controls directly above **Printable QR Payment Card preview**, followed by card exports.
- Fixed-price labels are snapshots of the generated QR amount.
- Descriptions and donation causes allow 30 characters. Give to / Cause defaults to the recipient name and follows name changes until manually edited. Custom causes (including an intentionally blank value) are preserved across amount-mode changes. Clearing the form restores automatic recipient-name defaults.
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
