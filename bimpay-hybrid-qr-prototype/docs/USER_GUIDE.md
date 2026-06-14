# User Guide

## Access Layers

The application has two separate sign-in concepts:

1. **Site password** protects the entire private prototype.
2. **Supabase collaborator identity** identifies an invited person inside shared workspaces.

Passing the site password does not automatically grant access to a Supabase workspace. A user must
also be invited through Supabase Authentication and added to the workspace.

## Experimental QR Lab

### Generate

Use **QR Generator** to edit payload fields directly. The form exposes merchant account data,
merchant category code, amount, country, name, city, additional data, and test-only identifiers.

The generator is intended for protocol inspection. It does not create a wallet transaction.

### Scan and Resolve

Use **Scanner** to:

- Scan with a device camera.
- Upload an image containing a QR code.
- Paste a raw payload.
- Resolve `/pay?emv=...` links.
- Resolve token-backed `/pay?t=...` sessions while they remain active.

CRC validation checks payload integrity, not legitimacy or authorization.

## Profile Scenario Lab

### Profile Catalog

The built-in catalog includes:

- Individuals
- Charities
- Churches
- Businesses
- Multi-branch merchants

The same core profiles are reused by the Wallet Funding Lab. Custom Scenario profiles are separate
from custom Wallet profiles because the two labs model different concerns.

### Account Transfer

1. Select two different account profiles.
2. Enter a fixed amount and reference.
3. Review validation results.
4. Generate the situational QR request.
5. Move the request through its simulated lifecycle.

No wallet balance changes when a Scenario request is authorized or refunded.

### Merchant Checkout

Choose a preset merchant or create a custom merchant. Checkout supports:

- **Fixed amount:** the QR carries the requested amount.
- **Payer enters amount:** the payer supplies the amount after scanning.

### Multi-Branch Settlement Examples

**Test Harbor Pharmacy** demonstrates centralized settlement:

- Each branch has a distinct profile and store label.
- Both branches use the same synthetic settlement account.
- The store label identifies the branch during reconciliation.

**Test Island Home** demonstrates branch-level settlement:

- Each branch has a distinct synthetic settlement account.
- Each branch also has an independent bank-direct profile in the Wallet Funding Lab.

### Lifecycle States

| State | Meaning |
| --- | --- |
| Created | Request exists but has not been scanned. |
| Scanned | A participant opened or scanned the request. |
| Authorized | Sandbox approval was recorded. |
| Declined | Sandbox rejection was recorded. |
| Expired | Request was marked expired. |
| Cancelled | Request was cancelled. |
| Refunded | An authorized simulation was marked refunded. |

These are workflow labels only. They are not bank or processor responses.

### Custom Profiles and History

Custom people, custom merchants, and completed scenario history persist in browser storage.
Collaborators may explicitly load or publish them through a shared workspace. Until published,
local edits remain local.

## Wallet Funding Lab

### Funding Models

| Model | Stored value | Linked account use |
| --- | --- | --- |
| Prepaid | Required for payments | Used to reload the wallet |
| Bank-linked | None | Selected account pays directly |
| Hybrid | Used first | Selected account covers the remainder |
| Bank-direct | None | Funds move directly to or from the bank account |

### Multiple Linked Accounts

A profile may have several linked accounts, such as checking and savings or operating and reserve.

- One enabled account is selected for each transaction.
- A default account is used when no explicit choice is made.
- A payment is never silently split across multiple bank accounts.
- If the selected account cannot cover the bank-funded portion, the transaction fails.
- Transfers into bank-only profiles credit the recipient's default account.

### Local Transactions

Without an active shared workspace, transactions update browser-local state:

- **Add money:** moves value from the selected linked account into stored value.
- **Pay merchant:** debits according to the funding model.
- **Send to wallet:** debits the sender and credits the recipient's wallet or default account.
- **Adjust balance:** records an explicit sandbox-only correction.

### Custom Wallet Profiles

Custom profiles can be created, edited, cloned, and removed. Custom profiles may also add linked
accounts, choose a default account, and remove non-required accounts.

Editing an aggregate bank balance applies the difference to the default linked account. The edit is
rejected if that would make the account negative.

## Shared Payment Links

When Redis and the payment-link API are available:

- A generated Scenario QR can create a token-backed session.
- Another signed-in browser can open or scan the link.
- Session state and recent events synchronize between browsers.
- Sessions expire after 15 minutes.

If the token service is unavailable, the embedded payload link still works locally, but the
lifecycle will not synchronize across devices.
