# BiMPay Hybrid QR Prototype

An independent, unofficial, test-only sandbox for exploring EMV-style QR payloads, fictional
payment scenarios, and FinTech wallet funding behavior.

> This prototype does not connect to BiMPay, banks, payment processors, or real payment rails.
> Never enter real account identifiers, credentials, customer data, or transaction information.

## Features

### Experimental QR Lab

- Build merchant-presented payloads field by field.
- Generate and inspect QR payloads, TLV fields, and CRC results.
- Scan with a camera or uploaded image.
- Resolve embedded payload links and short-lived shared payment sessions.

### Profile Scenario Lab

- Model transfers and merchant checkout with fictional people, charities, churches, and businesses.
- Use fixed or payer-entered amounts.
- Exercise created, scanned, authorized, declined, expired, cancelled, and refunded states.
- Explore multi-branch merchants with centralized or branch-level settlement.
- Save custom people and merchants.
- Share custom profiles and scenario history with invited collaborators.

### Wallet Funding Lab

- Compare prepaid, bank-linked, hybrid, and bank-direct profiles.
- Reload stored value, pay merchants, transfer between profiles, and adjust sandbox balances.
- Use multiple linked accounts with an explicit account selection per transaction.
- Maintain separate wallet, linked-account, and ledger records.
- Create and manage custom individual, business, charity, and church profiles.
- Run shared transactions through atomic Supabase database functions.

## Documentation

- [User guide](docs/USER_GUIDE.md)
- [Collaboration and permissions](docs/COLLABORATION.md)
- [Architecture and data model](docs/ARCHITECTURE.md)
- [Local setup, configuration, and deployment](docs/OPERATIONS.md)
- [Supabase migration history](supabase/migrations/README.md)

## Quick Start

Prerequisites:

- Node.js 20 or newer
- npm

```powershell
npm install
Copy-Item .env.example .env.local
npm run api
```

In a second terminal:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173`. Local development falls back to the test password defined in the
server source when `SITE_PASSWORD` is omitted. Set your own values in `.env.local` for normal use.

See [OPERATIONS.md](docs/OPERATIONS.md) for Supabase, Redis, Vercel, production authentication,
migrations, and verification.

## Safety Boundaries

- All built-in names, routes, account references, balances, and transactions are synthetic.
- Scenario lifecycle states do not change wallet balances.
- Wallet transactions affect only simulated balances.
- Payment-link sessions expire after 15 minutes.
- The observed identifiers `bb.org.cb.mpqr`, `QRBB`, `TESTROC1`, and `TESTROC2` are retained only
  for technical experimentation.
- This project is not affiliated with or endorsed by BiMPay, the Central Bank of Barbados, EMVCo,
  any financial institution, or any payment provider.
