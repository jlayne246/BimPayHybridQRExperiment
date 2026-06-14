# Setup and Operations

## Prerequisites

- Node.js 20 or newer
- npm
- Optional: Redis for shared payment-link sessions
- Optional: Supabase for durable collaboration
- Optional: Vercel for production hosting

## Local Installation

```powershell
npm install
Copy-Item .env.example .env.local
```

Edit `.env.local` before starting the application.

Run the local API:

```powershell
npm run api
```

Run Vite in another terminal:

```powershell
npm run dev
```

Vite serves `http://127.0.0.1:5173` and proxies `/api` to `http://localhost:5050`.

The local Express server stores payment links in memory. Restarting it clears those links. The
Vercel API uses Redis instead.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SITE_PASSWORD` | Production | Private site password |
| `SESSION_SECRET` | Production | HMAC secret for the site session cookie |
| `REDIS_URL` | Vercel payment links | Redis connection URL |
| `VITE_SUPABASE_URL` | Collaboration | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Collaboration | Browser-safe publishable/anon key |

Production authentication deliberately fails closed if `SITE_PASSWORD` or `SESSION_SECRET` is
missing. Local development has a source-defined fallback password for convenience; do not rely on
it for a deployed environment.

Generate a strong session secret, for example:

```powershell
[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Do not prefix server secrets with `VITE_`; Vite variables are exposed to the browser bundle.

## Supabase Setup

1. Create a private Supabase project.
2. Open the SQL Editor.
3. Run every file in `supabase/migrations` in filename order.
4. Disable public user sign-ups.
5. Add local and deployed URLs to the allowed redirect URL list.
6. Invite each collaborator in Supabase Authentication.
7. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
8. Redeploy after changing Vite environment variables.

See [the migration guide](../supabase/migrations/README.md) for migration responsibilities.

## Redis Setup

Set `REDIS_URL` to a private Redis instance reachable by the deployment. Payment-link records:

- Use keys in the form `payment-link:<token>`.
- Expire after 15 minutes.
- Contain only test payload and lifecycle data.

The API refuses payloads that do not contain the expected test-only identifiers.

## Verification

Run before deployment:

```powershell
npm run lint
npm run build
```

The project currently has no automated unit or integration test suite. Verification therefore
depends on TypeScript, ESLint, production builds, migration review, and manual sandbox checks.

Recommended manual checks:

1. Sign in and sign out of the private site.
2. Generate and scan an embedded QR.
3. Create and update a token-backed payment link.
4. Load and publish a Wallet workspace as owner/editor.
5. Confirm a viewer cannot publish or transact.
6. Run a hybrid payment using each linked account.
7. Confirm insufficient selected-account funds fail without using another source.
8. Load and publish Scenario profiles/history.
9. Trigger a revision conflict from two browser sessions.

## Vercel Deployment

Set all environment variables in the Vercel project, then deploy from the repository root or
through the linked Git repository.

`vercel.json` defines the build commands and SPA rewrites for `/pay`, `/create`, `/wallet`,
`/scenarios`, `/experimental/generate`, and `/experimental/scan`. Direct navigation to application
routes must resolve to `index.html`; keep this list aligned when adding routes.

After deployment, verify:

```powershell
curl.exe -sS -L -o NUL -w "status=%{http_code}" https://your-deployment.example
```

An HTTP 200 confirms availability, not functional authentication or database correctness.

## Backup and Recovery

For collaborative workspaces:

- Use Supabase backups appropriate to the project plan.
- Treat migrations as append-only once applied.
- Export important test workspaces before destructive schema experiments.
- Never restore only `wallet_profiles` without the related funding sources and ledger rows.

Browser-local data is not centrally backed up. Clearing site storage removes unpublished local
profiles, balances, and history.

## Troubleshooting

### Site reports authentication is not configured

Set both `SITE_PASSWORD` and `SESSION_SECRET` in the production environment and redeploy.

### Magic link does not create a user

This is intentional. Invite the user in Supabase Authentication first.

### Publish reports a revision conflict

Another workspace operation completed after the current browser loaded. Load shared state, review
the changes, then reapply and publish the local edit.

### Payment link is unavailable

Check `REDIS_URL`, Redis connectivity, the 15-minute expiry, and the private site session.

### Selected linked account has insufficient funds

Choose another account explicitly or adjust/reload the selected account. The engine will not split
the remainder across sources.
