# Reusable-package extraction

## Inspection and boundaries

The original `bimpay-qr-utility/src/Generator.tsx` combined `tlv`, `optionalTlv`, `crc16CcittFalse`, `buildEmvPayload`, local-wall-clock `generateTimestamp`, `isValidAmount`, `prepareQrLogo`, `renderPaymentQr`, `templateDimensions`, `outputDimensions`, and the Canvas `renderQrTemplatePng`. `QrTemplateExporter.downloadTemplatePdf` lazily imported `pdf-lib`. Its React components and banking selectors remain in the utility.

Dependencies were `qrcode`, `pdf-lib`, Fontsource Montserrat/Public Sans, React, Vite and Tailwind. The extracted QR package requires only `qrcode`; the cards package requires only lazy `pdf-lib` and bundles the original SVGs and Montserrat subsets. Public Sans remains an interface font in the app. TypeScript builds provide ESM and declarations without an added bundler.

```text
BimPayHybridQRExperiment/
├── package.json / package-lock.json
├── vitest.config.ts / playwright.config.ts
├── packages/
│   ├── bimpay-qr-generator/
│   │   ├── src/{index,pure,input,payload,browser}.ts
│   │   ├── tests/payload.test.ts
│   │   ├── package.json / tsconfig.json / README.md
│   │   └── dist/                         (generated)
│   └── bimpay-payment-cards/
│       ├── src/index.ts
│       ├── assets/                       (eight SVGs, local WOFF2s, font licence)
│       ├── tests/                        (hash fixtures and drawing snapshots)
│       ├── package.json / tsconfig.json / README.md
│       └── dist/                         (generated)
├── bimpay-qr-utility/
│   ├── src/Generator.tsx / src/data/     (UI and unchanged May 2026 directory)
│   ├── public/                           (interface logo and favicons)
│   ├── tests/                            (React integration and browser exports)
│   ├── package.json / README.md
│   └── dist/                             (generated)
├── bimpay-hybrid-qr-prototype/            (unchanged, outside workspaces)
└── docs/PACKAGE_EXTRACTION.md
```

## Compatibility decisions

Preserved GUI `bb.org.cb.mpqr`, scheme `QRBB`, tag 26 child mapping `00/01/02/03/04/11`, tag 62 child mapping `01`–`08`, tag 80 GUI/timestamp, local automatic timestamps, field order, trimming, name/city truncation, character-count lengths, CRC implementation, static initiation and the `***` sentinel. These remain experimental conventions, not an officially established scheme specification. Bank BIC/branch/transit data and application mappings are unchanged.

Preserved all eight artwork files byte-for-byte, text rendering algorithms, card colours, placements, dimensions, print scaling and optional QR branding. Original SVGs now live in the cards package. Template ID selects orientation. The card library receives an existing QR image; the app retains the original print-resolution regeneration step outside that library. The card API deliberately does not accept or interpret payment payloads. There is no new backend, API or collection of data.

Organisation identity still differs from charitable-donation mode. The checkbox selects variable donation templates; fixed donations retain the GIVE / TO / cause structure, with up to two entity lines and the cause field available in both amount modes. Fixed-price labels remain snapshots of the encoded generation amount.

Source builds now run from the workspace root. The utility's old lockfile is replaced by a root workspace lockfile; the prototype's lockfile remains untouched. Both packages are private and ESM-only, with no CommonJS build. Their APIs are new, so there is no previous public package API to break.

## Necessary validation and race fixes

- Generic TLV encoding rejects malformed two-digit tags, non-string values and lengths above 99 instead of creating malformed three-digit-length fields. The high-level API reports required values, malformed amount/currency/country/category/timestamp formats and nested overflow. The app keeps invalid drafts editable and reports errors on generation.
- Late generation errors are ignored when their request ID has been invalidated, just like late successful results. Previously an old error could replace newer messages after clearing.
- Card PNG, PDF and file-sharing operations recheck the current preview/payment key after async rendering, QR preparation, file conversion and PDF generation. Previously an export started while current could finish after inputs changed and still deliver the stale image. Raw QR sharing also rechecks before sharing/copying and cancels delivery if its technical view has unmounted.
- Local package font loading is awaited and retriable on failure, so another consumer does not need the app's stylesheet to render the original lettering.

No layout redesign or routing-code changes were made. Freshness state remains in React rather than in either generic library.

## Verification

`npm test` runs package fixtures and React integration tests. Drawing-command golden snapshots were captured from the original pre-extraction renderer, then verified against the extracted implementation for all eight templates and two fixed donation layouts. Asset SHA-256 fixtures preserve the original SVG bytes. This avoids brittle platform-specific Canvas pixel comparisons. PDF tests parse actual documents to verify physical page dimensions and metadata.

`npm run test:browser` uses a local Chromium executable to render every template and download actual PNG/PDF files, checking pixel and page dimensions and stale-export disabling. This is browser rendering validation, not independent payment-app interoperability or BiMPay certification. A4/A5 PNGs retain the original lack of embedded physical-size metadata; PDF pages specify physical size.

Build with `npm run build`; consume separately using the `npm pack` instructions in each package README. Neither packaging nor these tests publishes anything.

Final verification on the refactor branch:

- Both package TypeScript builds and the production Vite build pass.
- 50 Vitest tests pass: 12 payload, 26 card and 12 application integration tests.
- Two Chromium tests pass: eight-template PNG/PDF flow and public QR/logo APIs.
- Each package's own workspace test command passes.
- Local `npm pack` archives install into an isolated project with no React or Vite installed. ESM payload/PNG/PDF calls, all eight asset resolutions, and a strict NodeNext TypeScript consumer check pass.
- `git diff --check` passes; the original prototype and banking directory have no changes.

No unresolved implementation blockers were found. Browser/print rasterisation differences and experimental payment-app compatibility remain the limitations described in the package READMEs. Packages were packed locally for verification, not published.


## Deployment follow-up

The first Vercel deployment exposed a missing build entry point: the existing project runs `npm run build` inside `bimpay-qr-utility`, whereas the initial refactor only built package artifacts through the repository-root command. Package exports therefore pointed at absent JS/declaration files on a clean deployment, causing TS2307 and subsequent type-inference errors.

The utility now has a `prebuild` hook that invokes the repository's `build:packages` command before its own TypeScript/Vite build. The root `build` command delegates to the utility to avoid building libraries twice. This preserves the existing Vercel app-root configuration and does not require committing generated artifacts or changing package exports. See the utility README for the Vercel outside-root source setting.
