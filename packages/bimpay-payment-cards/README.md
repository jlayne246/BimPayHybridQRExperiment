# bimpay-payment-cards

Private TypeScript library for the utility's existing printable payment signage. Accepts an **existing QR image** from any payment system. It does not build, inspect or validate payment payloads and has no dependency on `bimpay-qr-generator`, React, or Vite. It returns PNG data URLs and PDF bytes; the consuming application owns previews, freshness checks, downloads, and sharing.

This repository is independently developed and experimental, with no institutional endorsement. The associated QR generator is not officially certified, and QR generation does not guarantee compatibility with all payment applications. Neither package executes or processes payments. Official use of BiMPay branding or scheme-specific functionality may require authorisation. The bundled artwork does not confer such authorisation.

## Workspace setup

From the repository root (Node 22.12+):

```sh
npm ci
npm run build -w bimpay-payment-cards
npm test -w bimpay-payment-cards
```

Builds use `tsc` and emit modern ESM with TypeScript declarations. The only runtime dependency is `pdf-lib`, dynamically imported on PDF export. PNG rendering does not load the PDF library. Both extracted packages remain `private: true` and must not be published.

## Public API

```ts
import { renderPaymentCard, exportPaymentCardPdf } from "bimpay-payment-cards";
import type { PaymentCardInput } from "bimpay-payment-cards";

const options: PaymentCardInput = {
  templateId: "bimpay-donations", // portrait donations
  outputSize: "a4",
  qr: existingQrImage, // PNG data URL, blob URL, or loadable image URL
  merchantName: "Example Organisation",
  donationCause: "Organ Appeal",
};
const png = await renderPaymentCard(options); // Promise<string>, PNG data URL
const pdf = await exportPaymentCardPdf(png, {
  templateId: options.templateId,
  size: options.outputSize,
  title: "Organ Appeal",
}); // Promise<Uint8Array>, application/pdf
```

`PaymentCardInput` requires `templateId`, `qr`, and `merchantName`. Optional fields:

| Field | Meaning |
| --- | --- |
| `outputSize` | `original` (default), `a5`, `a4` |
| `donationCause` | Cause for variable donations, or entity beneath `TO` for fixed donations; fixed donations fall back to merchant name |
| `fixedPrice` | Caller-supplied display label, e.g. `BBD $50.00`; required for fixed templates |
| `fixedDescription` | Optional description, at most 30 characters for non-donation fixed cards |
| `isDonation` | Explicit fixed-donation layout; defaults false, independent of organisation identity |
| `assetUrls` | Optional partial map of template IDs to alternative artwork URLs |

The renderer preserves the original uppercase labels, wrapping, dynamic font sizes, colours, QR placement, white margins and artwork. Fixed donations display `GIVE BBD $50.00`, then `TO`, then the cause/recipient (up to two lines). The original variable cause layout truncates to 30 characters. Supply a QR with a pre-embedded logo for optional QR branding; this package does not alter that QR. There is no separate arbitrary logo overlay on the original artwork.

The utility prepares a high-resolution QR before calling this package. Independent consumers must supply enough image resolution for printing (normally at least the final QR's pixel dimensions); the card renderer does not regenerate QR images or guarantee their scanning quality. The caller must keep display amounts consistent with the independently supplied QR.

### Templates and orientation

All eight original SVGs are bundled unchanged:

| Layout | Portrait ID | Landscape ID |
| --- | --- | --- |
| Acceptance | `bimpay-accepted` | `bimpay-landscape` |
| Merchant name | `bimpay-merchant` | `bimpay-landscape-merchant` |
| Donations | `bimpay-donations` | `bimpay-landscape-donations` |
| Fixed price / fixed donation | `bimpay-fixed` | `bimpay-landscape-fixed` |

Orientation is encoded in the template ID, avoiding incompatible template/orientation combinations. `QrExportTemplateId` and `QrOutputSize` are exported unions.

Additional exports:

- `resolveTemplateUrl(id, overrides?)`: validate an ID and resolve its bundled SVG, or a caller's override.
- `templateDimensions(id)`: original artwork dimensions, 1134 × 1701 portrait or 1701 × 1134 landscape.
- `outputDimensions(id, size)`: pixel dimensions and human-readable label.
- `QR_OUTPUT_SIZES`: original/A5/A4 portrait presets.
- `paymentCardPdfDimensions(id, size?)`: physical page dimensions in PDF points.
- `exportPaymentCardPdf(png, { templateId, size?, title?, creator? })`: one PNG image filling one correctly sized PDF page. `size` defaults to original; `creator` defaults to the package name.

A5 is 1748 × 2480 pixels and A4 is 2480 × 3508; landscape swaps these. The original artwork is scaled proportionally and centred on the chosen sheet. PDF A5/A4 dimensions are exactly 148 × 210 / 210 × 297 mm, converted at 72 points/inch. Original PDF dimensions retain four pixels per point (283.5 × 425.25 points portrait). Print PDFs at actual size on matching paper. PNGs target roughly 300 pixels/inch for A4/A5 but do not embed physical-size metadata.

### Assets and browsers

Assets use standard `new URL("../assets/...", import.meta.url)`, with no Vite environment variables or consumer `/public/templates/` path. The package archive includes all SVGs and Montserrat variable WOFF2 subsets plus their SIL Open Font License. Fonts are loaded once using `FontFace`, without a remote font service. Landscape text retains Arial as in the original.

PNG rendering requires modern browser Canvas 2D, `Image`, `FontFace` and `document.fonts`. It is not a server-side Canvas implementation. PDF export can run independently where `pdf-lib` is supported. Same-origin, data and blob image URLs work; remote QR/artwork URLs must permit CORS. Caller-selected URLs are the only optional external resources; the package does not call payment APIs or collect data.

Bundlers must retain/rewrite `new URL` asset references; unbundled browser deployments must serve the package's `dist/` and sibling `assets/` directories together (PDF also needs a bundler or import map resolving `pdf-lib`). Strict CSPs must allow the relevant local fonts/images and data or blob images used by the consumer. No stylesheet import is required. ESM only; no CommonJS build.

## Separate-application installation

```sh
# In this repository
npm run build -w bimpay-payment-cards
npm pack -w bimpay-payment-cards --pack-destination /tmp
# In the other application (no QR generator required)
npm install /tmp/bimpay-payment-cards-0.1.0.tgz
```

Keep `assets/` alongside `dist/` when manually copying the package. Do not copy just the JavaScript. `npm pack` includes everything required and does not publish anything.

## Verification and limits

Unit tests check dimensions, template resolution, SHA-256 hashes of the pre-extraction SVGs, configuration errors, PNG render calls and actual PDF documents. Drawing-command snapshots were captured from the original renderer for all eight templates plus fixed donations in both orientations. They cover wrapping, fonts and placement without assuming identical Canvas pixels on different operating systems. Root `npm run test:browser` checks actual Chromium rendering and PNG/PDF downloads. Font rasterisation can differ by platform; scheme approval and payment-app acceptance require separate validation.
