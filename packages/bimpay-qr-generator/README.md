# bimpay-qr-generator

Private, framework-independent TypeScript package extracted from BiMPay QR Utility. Builds experimental EMVCo merchant-presented payloads and optionally renders PNG QR images. ESM JavaScript and TypeScript declarations are emitted by `tsc`; there is no React or Vite dependency. Runtime dependency: `qrcode`.

This repository is independently developed and experimental. This generator is **not an officially certified BiMPay implementation** and has no institutional endorsement. Generation does not guarantee compatibility with all payment applications. This software does not execute or process payments. Official use of BiMPay branding or scheme-specific functionality may require authorisation.

## Workspace use

From the repository root (Node 22.12+):

```sh
npm ci
npm run build -w bimpay-qr-generator
npm test -w bimpay-qr-generator
```

The utility declares `bimpay-qr-generator: "*"` as a workspace dependency. Build the packages before starting the utility. Both packages remain `private: true`; do not publish them.

## Public API

```ts
import {
  buildBiMPayPayload, validateBiMPayInput,
} from "bimpay-qr-generator/payload"; // pure code, no QR or DOM dependency
import { generateBiMPayQr, renderPaymentQr, prepareQrLogo } from "bimpay-qr-generator";
import type { BiMPayInput } from "bimpay-qr-generator";

const input: BiMPayInput = {
  merchantName: "Example Organisation",
  fiAlias: "TESTBB", branchAlias: "TESTBB",
  accountReference: "00123", participantCode: "00000",
  amountMode: "fixed", amount: "50.00",
  additionalData: { referenceLabel: "TEST", purpose: "Organ Appeal" },
};
const errors = validateBiMPayInput(input); // string[], empty when valid
const payload = buildBiMPayPayload(input); // string; throws descriptive Error on invalid input
const { image } = await generateBiMPayQr(input, { width: 720, errorCorrectionLevel: "M" });
// image is a PNG data URL; result also includes the generated payload
```

Use synthetic routing/account values for experiments. Routing identifiers are supplied by the caller; this package does not contain a bank directory or establish an approved mapping.

`BiMPayInput` requires `merchantName`, `fiAlias`, `branchAlias`, `accountReference`, and `participantCode` strings. Optional fields:

| Fields | Defaults / meaning |
| --- | --- |
| `merchantCity`, `merchantCategoryCode`, `currency`, `country` | `BRIDGETOWN`, `0000`, `052`, `BB` |
| `amountMode`, `amount` | `variable` encodes `***`; `fixed` requires a positive numeric string with zero or two decimals |
| `gui`, `scheme`, `privateGui` | `bb.org.cb.mpqr`, `QRBB`, `bb.org.cb.mpqr` |
| `payloadFormat`, `initiationMethod` | `01`, `11` |
| `timestamp` | Generated on each call in local wall-clock `YYYYMMDDhhmmss`; inject a 14-digit string for deterministic output |
| `additionalData` | Optional `billNumber`, `mobileNumber`, `storeLabel`, `loyaltyNumber`, `referenceLabel`, `customerLabel`, `terminalLabel`, `purpose` |

The package retains the original name/city truncation to 25/15 characters before TLV trimming. It does not silently normalise fixed amount strings. These are compatibility decisions, not certification claims.

Lower-level exports:

- `tlv(tag, value)`, `optionalTlv(tag, value)`: two-digit tag/length encoding with original trimming and character-count semantics; lengths over 99 and malformed tags are rejected.
- `crc16CcittFalse(input)`: uppercase four-digit hexadecimal CRC, polynomial `0x1021`, initial value `0xffff`.
- `buildBiMPayFields(input)`: ordered field records for low-level inspection/draft previews; does not perform high-level required-field validation.
- `buildEmvPayload(fields: EmvField[])`: ordered caller-supplied fields, omits blanks, appends `6304` and CRC. Does not perform high-level required-field validation.
- `buildMerchantAccount(input)`: tag 26 children `00` GUI, `01` FI alias, `02` branch alias, `03` account reference, `04` participant code, `11` scheme.
- `buildAdditionalData(input)`: tag 62 children `01`–`08` in the order listed above.
- `buildPrivateMetadata(gui?, timestamp?)`: tag 80 children `00` GUI and `01` timestamp.
- `generateTimestamp()`, `isValidAmount(value)`, `BIMPAY_GUI`, `BIMPAY_SCHEME`.
- `renderPaymentQr(payload, width, logo?, margin = 4, errorCorrectionLevel?)`: render an existing payload to a PNG data URL. Defaults to M, or H when a logo is supplied. The high-level rendering options use the same settings; width defaults to 380.
- `prepareQrLogo(source)`: crop transparent/near-white margins, preserve aspect ratio, and limit the longest edge to 1024 pixels; returns a PNG data URL. Rendering retains the original rounded backing and logo area budget.

`EmvField`, `CoreFields`, `MerchantAccountFields`, `AdditionalDataFields`, and `PrivateFields` types are also exported for low-level consumers. The high-level API does not require the utility's React state.

## Browser compatibility and limitations

Payload construction works without browser globals (including Node ESM). QR images use `qrcode`; logo preparation/compositing requires a modern browser with Canvas 2D, `Image`, and `roundRect`. Supply same-origin, data, or CORS-enabled image URLs. No network API is used; loading a caller-supplied remote logo URL is the caller's choice. Logos can reduce scanning reliability even with H error correction.

The GUI, `QRBB`, tag mappings, static initiation method, automatic timestamp, and `***` variable-amount sentinel preserve the existing experimental application. They have not been independently established as an officially certified specification. TLV lengths and CRC retain the existing JavaScript character-based behaviour; non-ASCII interoperability has not been certified. The timestamp format check does not certify a calendar date or a payment identifier. Validation checks syntax and required values, not bank accounts, ownership, routing correctness, scheme approval, or payment-app acceptance.

## Use from another application without publishing

```sh
# In this repository
npm run build -w bimpay-qr-generator
npm pack -w bimpay-qr-generator --pack-destination /tmp
# In the separate application
npm install /tmp/bimpay-qr-generator-0.1.0.tgz
```

Use a bundler that handles modern ESM and the `qrcode` dependency for browser rendering. Pure consumers can import `bimpay-qr-generator/payload` directly. No CommonJS build is supplied. Install from a packed archive rather than copying only `src/`; the archive includes built JS and declarations. Packing does not publish the package.
