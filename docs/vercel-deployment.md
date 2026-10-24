# Publish StockWise AI on Vercel

This repository supports one Vercel project for the Vite frontend and Express API. The root `vercel.json` builds `client/dist`, routes `/api/*` to `api/index.js`, and serves React deep links through `index.html`. Shared analytics modules and Prisma runtime files are included with the function. Local development commands are unchanged.

## Project settings

Import the GitHub repository into Vercel. Keep **Root Directory at repository root**, choose **Other** as the framework preset, and use Node.js **22.x**. Commit the source, lockfiles, `api/`, root package files and `vercel.json` first. Do not upload `.env` or `node_modules`.

The checked-in configuration sets:

- Install: `npm ci --prefix server && npm ci --prefix client`
- Build: `VITE_API_URL=/api npm run build`
- Output: `client/dist`

The build generates Prisma Client and compiles the frontend. It does not migrate, seed, or change database records.

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

Super admin is an existing `admin` account whose email matches the server-only `SUPER_ADMIN_EMAIL`. No schema migration is required. It is checked on every user-management request; browser state cannot grant permissions. Ordinary admins cannot manage accounts. `/users` lists/searches accounts, adds staff/admin accounts, edits names/roles, and deletes accounts without related business records. Owner deletion/demotion is blocked. User administration is real database activity; fictional product/sales changes remain in browser memory.

## After publishing

1. Confirm `/api/health` and `/api/ready` respond successfully.
2. Open `/login` directly, sign in as the owner, and check **Manage users**.
3. Verify an ordinary demo account cannot access `/api/users`.
4. Check a deep link such as `/ai-insights` and homepage image loading.
5. Verify Groq and Google sign-in if configured.

Local production build and authorization/UI checks are documented in `docs/verification.md`. A hosted Vercel deployment has not been run yet. The API function is configured for 60 seconds; provider calls that exceed this require timeout tuning or a longer-running host. Existing in-memory rate limits are per function instance; add Vercel Firewall rate limiting or a shared rate-limit store for dependable public abuse protection. Health readiness uses the existing Neon connection; no destructive integration suite should run on this database.

Vercel references: [Express](https://vercel.com/docs/frameworks/backend/express), [project configuration](https://vercel.com/docs/project-configuration/vercel-json).
