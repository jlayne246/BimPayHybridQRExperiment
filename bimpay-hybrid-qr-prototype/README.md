# BiMPay Hybrid QR Prototype

## Workspaces

- **Experimental QR Lab** preserves the field-level generator and scanner/resolver.
- **Profile Scenario Lab** uses fictional people and merchants to generate situational payment
  requests and model payer confirmation.

Scenario transactions are browser-session simulations only. They do not change balances, contact
external financial institutions, or move funds.

The scenario lab also supports custom merchant checkouts and browser-local fictional person
profiles. Custom people persist in local storage until removed; transaction history remains limited
to the current browser session.

Merchant scenarios support fixed amounts and payer-entered variable amounts. Before generation, the
scenario lab validates route pairings, synthetic account references, field lengths, merchant
category codes, amount behavior, and test-only metadata. Generated requests can move through
created, scanned, authorized, declined, expired, cancelled, and refunded sandbox states. Authorized
and refunded simulations include a local receipt view.

Custom merchant profiles can be saved, edited, selected, and removed in local browser storage.

Merchant category selectors share an expanded ISO 18245 MCC catalog. EMV merchant-presented QR
stores the selected four-digit MCC in tag 52; the category definitions themselves are maintained by
ISO rather than EMVCo.

Generated sandbox payloads retain the observed BiMPay-oriented values `bb.org.cb.mpqr`, `QRBB`,
and the historical test routes `TESTROC1`/`333331` and `TESTROC2`/`333332`. Profile names,
account references, and transaction state remain synthetic.

## Sign in

The site and payment-link APIs are protected by a password and an HTTP-only
session cookie.

Please contact the developer for the default password.

Sessions last for eight hours. Run both `npm run api` and `npm run dev` for
local development.

## Vite template notes

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
