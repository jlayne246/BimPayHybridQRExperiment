# BiMPay Hybrid QR Prototype

## Workspaces

- **Experimental QR Lab** preserves the field-level generator and scanner/resolver.
- **Profile Scenario Lab** uses a shared catalog of fictional people, charities, churches, and
  businesses to generate situational payment requests and model payer confirmation.
- **Wallet Funding Lab** uses those same profiles to compare prepaid, bank-linked, hybrid, and
  bank-direct funding. The models can make merchant payments and transfer funds to each other while
  wallet and linked-bank balances are tracked separately.

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

Wallet and bank balances are browser-local simulations. Prepaid payments use stored value,
bank-linked payments debit the simulated linked bank balance, and hybrid payments use stored value
before falling back to the linked bank balance. Bank-direct profiles have no stored wallet value,
which supports wallet-to-bank and bank-to-wallet scenarios. Transfers can move between any two
funding models.

The wallet lab also supports browser-local custom wallet profiles. Custom profiles can be created,
edited, cloned, and removed, and can participate in the same merchant payments and cross-model
transfers as the built-in examples.

Built-in examples include fictional individual, charity, church, and business profiles. The same
catalog is available in both labs. Some organizations and businesses are deliberately bank-direct
so they can receive a wallet transfer or donation without owning a stored-value wallet.

## Private collaboration with Supabase

The wallet lab can optionally publish its complete wallet/profile/ledger state to an invite-only
Supabase workspace. Without Supabase environment variables, it remains fully functional in local
browser storage.

1. Create a private Supabase project.
2. Run the SQL files in `supabase/migrations` in filename order in the Supabase SQL Editor.
3. In Authentication settings, disable public user sign-ups.
4. Add the deployed site URL and local development URL to the allowed redirect URLs.
5. Invite each collaborator from the Supabase Authentication dashboard.
6. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
7. Add those same two variables to the Vercel project and redeploy.

The Supabase service-role key must never be added to a `VITE_` variable or browser code. Workspace
owners can grant invited users `editor` or `viewer` access from the Wallet Funding Lab. Publishing
is explicit rather than automatic: collaborators load shared state, work locally, and publish when
ready. Shared workspaces use revision checks, so a stale browser cannot overwrite balances that
another user published first. Realtime notifications indicate when another collaborator has
published a newer state.

Ordinary shared wallet operations do not publish browser-calculated snapshots. Reloads, merchant
payments, wallet transfers, and explicit sandbox balance adjustments execute through atomic
Supabase database functions. The functions lock affected profiles, recheck funds, update balances,
append ledger entries, and increment the workspace revision in one transaction. Client-generated
idempotency keys make safe retries return the original result instead of applying a payment twice.
Full-state publishing remains available for workspace configuration changes such as profile setup
and sandbox resets.

The existing Redis integration remains limited to short-lived payment-link sessions. Supabase
stores durable collaborative wallet workspaces.

Merchant category selectors share an expanded ISO 18245 MCC catalog. EMV merchant-presented QR
stores the selected four-digit MCC in tag 52; the category definitions themselves are maintained by
ISO rather than EMVCo.

## Shared transaction sessions

When the payment-link API is available, scenario QR codes create a shared 15-minute transaction
session. A second signed-in browser or device can scan the QR in the Scanner section or open the
payment link, then mark it scanned, authorize or decline it, cancel or expire it, and simulate a
refund. The creator polls the shared token and reflects those updates, including the event history
and authorized payer-entered amount.

Embedded-payload QR links still resolve when the token API is unavailable, but their lifecycle is
local to that browser and cannot synchronize across sessions.

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
