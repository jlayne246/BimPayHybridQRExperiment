# Collaboration and Permissions

## Overview

Supabase workspaces provide durable, invite-only collaboration for the Wallet Funding Lab and
Profile Scenario Lab. Both labs use the same workspace membership and revision number, but store
their data in separate tables.

## Identity and Invitation Flow

1. An administrator invites a user in Supabase Authentication.
2. The user signs in to the private site with the shared site password.
3. The user requests a Supabase magic link from either collaboration panel.
4. A workspace owner adds the invited email as an editor or viewer.
5. The collaborator loads the workspace in either lab.

Public user creation should remain disabled. The client requests magic links with
`shouldCreateUser: false`.

## Roles

| Role | Read shared data | Publish configuration | Run wallet transactions | Manage members |
| --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | Yes | No |
| Viewer | Yes | No | No | No |

Workspace owners cannot be removed through the application.

## Explicit Load and Publish

Each browser works with a local copy:

- **Load shared** replaces the relevant local lab data with the shared version.
- **Publish local** replaces the relevant shared lab data with the local version.
- Realtime notifications indicate that another collaborator changed the workspace.

Publishing is intentionally explicit. This makes experiments reproducible and prevents every form
edit from immediately changing the shared workspace.

## Revision Conflicts

The `workspaces.revision` value protects both labs.

1. Loading records the current revision.
2. Publishing locks the workspace row and compares the expected revision.
3. If another operation incremented the revision, publishing fails with a conflict.
4. The user must load the newer state before publishing again.

Because Wallet and Scenario publishing share one revision, a stale Scenario page cannot overwrite
after a wallet update, and vice versa.

## Atomic Wallet Operations

Shared reloads, merchant payments, transfers, and balance adjustments do not trust
browser-calculated snapshots. They execute through `security definer` database functions that:

- Check editor or owner permission.
- Lock affected profile and funding-source rows.
- Recheck balances.
- Apply debits and credits.
- Append ledger entries.
- Increment the workspace revision.
- Store an idempotent transaction response.

Client-generated idempotency keys prevent a retry from applying the same operation twice.

## Scenario Collaboration

The Scenario Lab shares:

- Custom people
- Custom merchants
- Completed simulated transaction history

It does not share the active unsaved QR form, current camera state, or transient generated image.

An empty shared Scenario workspace does not automatically erase an editor's existing local data.
The editor can publish the local bundle to initialize the workspace. A viewer loading an empty
workspace receives the empty shared state.

## Separation of Concerns

Scenario authorization and refund states do not modify Wallet Lab balances. To model the financial
effect of a scenario, run a corresponding wallet payment or transfer separately.

Short-lived payment-link sessions are stored in Redis. Durable profiles, balances, ledgers,
memberships, and Scenario history are stored in Supabase.

## Security Rules

- Never expose the Supabase service-role key to browser code.
- Only use the publishable/anon key in `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Row-level security restricts reads to workspace members.
- Direct writes to financial and Scenario tables are revoked from authenticated users.
- Mutations run through permission-checking database functions.
- Use fictional data only, even in a private workspace.
