# Supabase Migrations

Run migrations in filename order. These files are cumulative and should be treated as append-only
after they have been applied to a shared environment.

| Migration | Purpose |
| --- | --- |
| `202606140001_wallet_collaboration.sql` | Creates workspaces, members, wallet profiles, ledger entries, RLS helpers, and initial workspace RPCs. |
| `202606140002_profile_kinds_and_revisions.sql` | Adds profile kinds, workspace revisions, and revision-aware full-state publishing. |
| `202606140003_atomic_wallet_transactions.sql` | Adds idempotency records and atomic reload, payment, transfer, and adjustment RPCs. |
| `202606140004_unified_profile_catalog.sql` | Adds business and bank-direct support and updates transaction rules. |
| `202606140005_multiple_wallet_funding_sources.sql` | Adds normalized linked accounts and source-aware atomic operations. |
| `202606140006_shared_scenario_lab.sql` | Adds shared custom Scenario profiles and simulated Scenario history. |

## Applying Migrations

1. Open the Supabase SQL Editor.
2. Select the target project carefully.
3. Run each unapplied file in order.
4. Confirm the statement succeeds before continuing.
5. Redeploy the browser application only after the required schema is available.

The repository does not currently include Supabase CLI metadata or an automated migration runner.

## Security Model

- Tables use row-level security.
- Workspace members can read the records for their workspaces.
- Direct authenticated writes to financial, funding-source, idempotency, and Scenario tables are
  revoked.
- Owners and editors mutate shared state through permission-checking `security definer` functions.
- Viewers have read-only access.

## Consistency Model

`workspaces.revision` coordinates full-state Wallet and Scenario publishing. Atomic wallet
transactions increment the same revision. Publishing with a stale expected revision fails rather
than overwriting newer data.

`wallet_profiles.bank_balance` mirrors the sum of the profile's linked funding sources. Source-aware
RPCs update both representations in the same transaction.

## Adding a Migration

- Use the next sortable timestamp/sequence filename.
- Prefer additive changes and `create or replace function`.
- Preserve existing function permissions.
- Add or update RLS policies for every new table.
- Backfill existing workspaces where a new invariant requires data.
- Update this file, `docs/ARCHITECTURE.md`, and `docs/OPERATIONS.md`.
- Verify the migration in a non-production project before applying it to the collaborative sandbox.
