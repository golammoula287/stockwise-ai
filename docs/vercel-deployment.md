# Publish StockWise AI on Vercel

This repository supports one Vercel project for the Vite frontend and Express API. The root `vercel.json` builds `client/dist`, routes `/api/*` to `api/index.js`, and serves React deep links through `index.html`. Shared analytics modules and Prisma runtime files are included with the function. Local development commands are unchanged.

## Project settings

Import the GitHub repository into Vercel. Keep **Root Directory at repository root**, choose **Other** as the framework preset, and use Node.js **22.x**. Commit the source, lockfiles, `api/`, root package files and `vercel.json` first. Do not upload `.env` or `node_modules`.

The checked-in configuration sets:

- Install: `npm ci --prefix server && npm ci --prefix client`
- Build: `VITE_API_URL=/api npm run build`
- Output: `client/dist`

The build generates Prisma Client and compiles the frontend. It does not migrate, seed, or change database records.

Before releasing the private-workspace code, apply committed migrations with `npm run prisma:migrate --prefix server` against the intended database after the disposable PostgreSQL CI checks pass. Migration `20261024160000_private_workspaces` preserves existing accounts and rows in the legacy workspace; newly created accounts start with an empty, permanent workspace. It adds ownership columns and scopes SKUs per workspace, retaining a partial unique index for legacy SKUs. Do not reseed. Deploy the matching backend and frontend together; older backend versions do not enforce workspace ownership.

Migration `20261024170000_admin_staff_access` adds staff-to-admin ownership, active/restricted status and session versions. Its staff foreign key cascades account deletion. Both migrations are required for the current code. Neither has been applied by this implementation task.

Migration `20261024180000_workspace_categories` adds saved workspace categories. All three migrations are required for the current code and remain unapplied. Admins use Inventory → Categories → Add category; new categories are available in product forms/filters before any product uses them. Staff can read categories but cannot create them. Existing product category names remain visible. Browser demo categories reset with the demo. Apply migrations only through the controlled release sequence above; do not seed or run destructive integration tests on Neon.

## Private environment variables

Configure these in Vercel before deployment:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Your existing Neon **pooled** PostgreSQL URL with SSL |
| `JWT_SECRET` | A private random secret, at least 32 characters |
| `NODE_ENV` | `production` |
| `CLIENT_URL` | Exact public frontend origin, for example `https://your-project.vercel.app` |
| `DEMO_READ_ONLY` | `true` |
| `SUPER_ADMIN_EMAIL` | Same owner email provisioned locally |
| `AI_API_KEY` | Your private Groq key, if using the assistant |
| `AI_BASE_URL` | `https://api.groq.com/openai/v1` |
| `AI_MODEL` | Your configured Groq model |
| `GOOGLE_CLIENT_ID` | Optional Web OAuth client ID |
| `VITE_GOOGLE_CLIENT_ID` | Same optional public OAuth client ID |

`VITE_API_URL` is forced to `/api` by the build so a local `.env` cannot send the published frontend to localhost. Never put database, JWT, password, or Groq secrets in `VITE_*` variables. Configure production origins in Google Cloud if enabling Google sign-in.

The super-admin account has already been provisioned in the configured Neon database. Reuse that database and set the same `SUPER_ADMIN_EMAIL`. To prepare an owner in another database, set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` privately in the local server environment, then run `npm run admin:prepare --prefix server`. This changes only the named owner account and resets its password; it does not reseed business data. The provisioning password is not required in Vercel runtime variables.

## Roles and user management

The app owner is an existing legacy `admin` account whose email matches the server-only `SUPER_ADMIN_EMAIL`. `/users` shows admins to the app owner and only their own staff to each private workspace admin. Owners create admins; admins create staff. Roles and workspace ownership are fixed by the server. Owner deletion is blocked. Password reset and access restriction invalidate old sessions. Staff cannot edit passwords, inventory or business settings; they can view shared workspace data, checkout and maintain customers. Business settings are shared with their admin rather than copied into separate staff workspaces.

Restricting an admin blocks their staff on every authenticated request, including existing sessions and Google sign-in. Restoring access does not restore old sessions or individually restricted staff. Confirmed admin deletion atomically deletes only that admin's private business records, then deletes the admin; the database cascades staff accounts and their settings. Individual staff deletion preserves invoice/stock history. No existing unassigned staff are automatically moved into a private workspace.

New public signups are private workspace admins, not platform owners. Inventory, customers, invoices, stock history, reports, assistant tools and settings are scoped to the database-authenticated account, including inside checkout transactions. `DEMO_READ_ONLY=true` continues to protect the legacy demo while private accounts can save their own records. Private accounts receive no demo badge or seeded history. Google sign-in links to an existing registered account and preserves that account's workspace. Demo-only dues/custom product fields retain their existing limitations. Previously registered accounts are not automatically converted; this change applies to new accounts.

## After publishing

1. Confirm `/api/health` and `/api/ready` respond successfully.
2. Open `/login` directly, sign in as the owner, and check **Manage admins**.
3. Verify a private admin sees only their own **Manage staff**, and staff/demo accounts cannot access `/api/users` or mutate passwords/inventory/business settings. Use disposable CI data to verify restriction, restoration, session invalidation and admin deletion; never test destructive deletion on the shared Neon demo database.
4. Check a deep link such as `/ai-insights` and homepage image loading.
5. Verify Groq and Google sign-in if configured.

Local production build and authorization/UI checks are documented in `docs/verification.md`. A hosted Vercel deployment has not been run yet. The API function is configured for 60 seconds; provider calls that exceed this require timeout tuning or a longer-running host. Existing in-memory rate limits are per function instance; add Vercel Firewall rate limiting or a shared rate-limit store for dependable public abuse protection. Health readiness uses the existing Neon connection; no destructive integration suite should run on this database.

Vercel references: [Express](https://vercel.com/docs/frameworks/backend/express), [project configuration](https://vercel.com/docs/project-configuration/vercel-json).
