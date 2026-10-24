# Portfolio deployment handoff

The application is verified locally against fictional Neon demo data. Public hosting is not yet provisioned. `render.yaml` prepares a Node API and static React site using the existing Neon database; it creates no additional database. See [Render Blueprint reference](https://render.com/docs/blueprint-spec).

## Release procedure

1. Review and push the local changes to your GitHub repository. Require a passing `Build and test` workflow before release; its integration database is disposable and does not use Neon.
2. Review the Render Blueprint and its resource plans before importing it. Select an API region close to Neon when creating resources. Automatic deployments are disabled so schema changes can be coordinated deliberately.
3. In the API host, privately set the existing Neon `DATABASE_URL`, actual HTTPS frontend `CLIENT_URL`, and Groq key if enabled. The Blueprint generates a separate production JWT secret. Keep `DEMO_READ_ONLY=true`. Do not upload the local `.env` file or seed/admin passwords.
4. In the static frontend service, set `VITE_API_URL=https://<actual-api-host>/api` before building. This value is public. Ensure the SPA rewrite remains enabled.
5. Before the release, apply `npx prisma migrate deploy` from a trusted environment using the intended Neon URL. Current migrations have already been applied locally to the demo database. Do not run forced seeding. The free service template omits pre-deploy hooks; [Render pre-deploy commands require a paid service](https://render.com/docs/deploys).
6. Deploy the API and frontend, reconcile their final URLs/origins, then test `/api/ready`, sign-in using the dedicated staff login, inventory, history/invoices, analytics, and direct refresh of `/dashboard` and `/products` in a fresh browser.
7. Confirm public write requests return 403 for sales, products, customers, registration, and settings, even with an authenticated token. Check a mobile browser and the API cold start. Publish only the staff credentials intended for this restricted demo.

## Recovery and data handling

- Before schema changes, make a Neon backup/branch or database export using the provider's available recovery tools. Never commit exports containing connection strings or customer data.
- For a restore exercise, restore fictional demo data into a disposable recovery database and verify product, sale, and invoice counts there. This has not yet been performed; do not claim restore verification.
- If an application release fails, redeploy the last known-good commit. Treat database migrations separately: application rollback does not reverse schema changes. Prefer backward-compatible additive migrations and an explicit forward repair over destructive resets.
- Do not reset data through the running public app. Seed skips an existing database; forced seed deletes historical data and is not a release command. If fictional data needs refreshing, schedule it privately with a recoverable backup and validate before reopening access.

## Remaining external checks

- Provider confirmed as Groq, with a successful live read-only inventory lookup. Use the Groq endpoint/model from the example environment; keep the key server-side. Forecasting works independently of Groq.
- Hosted CI, public URLs, cold starts, actual production CORS, restore validation, and Upwork publication remain pending.
- Only fictional demonstration data is supported by this release plan; no claims of customer adoption or forecast accuracy are implied.

### Shared analytics build root

The latest `render.yaml` uses repository root `.` for both services so `shared/dashboardAnalytics.mjs` is available. API: `npm ci --prefix server && npm run prisma:generate --prefix server`, start `npm start --prefix server`. Frontend: `npm ci --prefix client && npm run build --prefix client`, publish `client/dist`. If configuring hosting manually, use these root/build settings instead of the older per-directory root instructions. No deployment was performed by this change.
