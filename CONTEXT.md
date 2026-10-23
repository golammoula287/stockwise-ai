# StockWise AI — compact project context

## Source and confidence
- Source: `/Users/golammoula/Downloads/StockWise_AI_Updated_3_Phase_Upwork_Plan.pdf`, 8 pages, revised 24 October 2026.
- Repository reference: https://github.com/meherabmehu/stockwise-ai
- The PDF is a roadmap, not proof that fixes, tests, or deployment succeeded. Its repository observations require rechecking.
- Source is directly in this `STOCKWISE AI/` workspace (flattened at user request), baseline commit `da19cbb`; work remains local and uncommitted. Run commands from root or its `server/` and `client/` directories as documented.

## Objective and scope
Deliver an Upwork portfolio showcase: a working safe demo, tested repository, five screenshots, a 60–90 second video, and one case study.

Planned stack: React, Vite, Node.js/Express, PostgreSQL, Prisma, JWT, Recharts. Existing capabilities described by the plan: inventory CRUD/search, stock adjustments and ledger, low-stock alerts, POS checkout/invoices, customer history, dashboard analytics, Holt forecasting, restock suggestions, and an optional read-only AI assistant.

No launch expansion into procurement, multi-tenant billing, warehouse modules, or new ML models. Ten workdays is a target, not a deadline that overrides launch gates.

## Phase 1 — environment and baseline (days 1–2)
Once source is available, the plan's first implementation action is to configure `server/.env` and `client/.env` from their examples, ensuring ignore rules protect real values.

Server variables: `NODE_ENV`, `PORT` (local 5000), `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET` (32+ random characters), `JWT_EXPIRES_IN` (example 7d), `CLIENT_URL` (local `http://localhost:5173`), `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (unique/private). Selected provider: xAI Grok. Server-only variables: `AI_API_KEY`, `AI_MODEL` (default `grok-4.7`), `AI_BASE_URL` (default `https://api.x.ai/v1`). Database provider selected by user: Neon; development/test/demo targets must be isolated.

Client variable: `VITE_API_URL` (local `http://localhost:5000/api`). Use separate local `stockwise` and `stockwise_test` databases. Never copy real secrets into this file.

Baseline sequence after inspecting scripts: install dependencies; generate Prisma client; apply migrations; seed only an isolated local database with `SEED_FORCE=false`; run backend tests, frontend build, and both apps. The PDF uses `npm install` because it reports ignored lockfiles; verify that before choosing the install command.

Verify API health plus a DB-backed authenticated request, login/token rejection/roles, inventory flows, sale → invoice → stock reduction → customer history, KPIs/forecasts, and UI error states. Log issues as `severity | page/API | reproduction | expected vs actual | owner | status`.

Exit gate: correct local envs, running frontend/API, isolated test DB, applied migrations, one complete verified sale, prioritized defects.

## Phase 2 — fixes, UI, deployment (days 3–7)
PDF-reported baseline risks (now verified against source; see current handoff and `docs/issue-register.md` for fix status):
- P0: `server/server.js` CORS uses `[CLIENT_URL, true]`; restrict origins and test allowed/blocked requests.
- P0: `seedData.js` creates admin users with a default password; public access needs a restricted read-only demo or video fallback.
- P0: `server/seed.js` defaults to force seeding; prevent destructive routine/live seeds.
- P1: `.gitignore` excludes `package-lock.json`; track both lockfiles and then use `npm ci` in CI/hosting.
- P1: `/api/health` does not check DB connectivity; add readiness or a separate DB smoke check.

Fix business-flow defects before cosmetic polish. Check layouts at 375/768/1440px: navigation, charts, inventory tables, cart, modals, labels/focus, validation, loading/empty/error states, consistent dates/currency, and forecast uncertainty.

Deployment plan (provider preferences, not provisioned resources):
- Frontend: Render Static Site or appropriately licensed Vercel plan; root `client`; build `npm ci && npm run build`; output `dist`; SPA fallback to `/index.html`.
- API: Render Web Service; root `server`; build `npm ci && npx prisma generate`; start `npm start`.
- DB: persistent managed PostgreSQL with separate demo data and a backup/restore plan.
- Configure production server secrets and HTTPS `CLIENT_URL`; build frontend with public `VITE_API_URL=https://<api>/api`. Run `npx prisma migrate deploy` as a controlled release step; no automatic force seed.
- Sequence: DB → API/migrations → frontend → final origins → private-browser smoke tests. Check cold start, failed requests, direct route refresh, and core flows.

Exit gate: safe non-admin public experience, working critical flows, no exposed secrets/privileged credentials, usable mobile UI.

## Phase 3 — QA and portfolio (days 8–10)
- Acceptance: auth/protected APIs; inventory/stock checks; POS sale and rollback; invoice/history; metrics matching sample sales; understandable forecast assumptions; honest unconfigured assistant state; enforced read-only assistant access; responsive/accessibility/error checks; fictional data and safe demo controls.
- Run frontend production build and backend tests. Add GitHub Actions CI with isolated PostgreSQL. Reconcile the README/demo-checklist test-count mismatch reported by the PDF using actual test results.
- Capture five screenshots: dashboard; inventory/low stock; checkout/invoice; AI Insights with 14-day forecast/restock suggestions; customer history or a grounded assistant answer.
- Video: problem (0–15s), inventory/POS (15–35s), invoice/history/dashboard (35–55s), forecasting/optional assistant (55–75s), architecture/links (75–90s).
- README: screenshots, setup, architecture, testing, limitations. Case study: cover, concise description, stack, 3–5 screenshots, video, working links, fictional-data/restricted-access disclosure.
- Suggested Upwork title: “Inventory & Sales Management Web App with React, Node.js and AI Insights”. Treat suggested authorship/contribution claims as unverified until supported.

Exit gate: critical checks signed off, links pass in a fresh browser, reproducible build/test evidence, honest claims, and a workflow understandable in under two minutes.

## Current handoff — 24 October 2026
- User intent: professional / Upwork portfolio; preserve scope. Accepted additional checks: checkout integrity and isolated demo data. Providers: Neon PostgreSQL and xAI Grok.
- Source: workspace root, baseline `da19cbb`. No push, deployment, publication, or database modification performed.
- Implemented locally: exact-origin CORS; opt-in server-enforced `DEMO_READ_ONLY`; removed frontend admin autofill, seed default password and duplicate admin; non-destructive seed default and no startup seed; DB-aware `/api/ready`; mandatory isolated test URL guard including Neon pooled/direct alias comparison; test migration helper; both npm lockfiles; GitHub Actions with disposable PostgreSQL; Grok defaults and request/tool/error tests; Neon setup guide and issue register.
- Private env files exist at `server/.env` and `client/.env`, Git-ignored. JWT secret and seed password generated privately; Neon URLs remain placeholders and AI key is empty. Never display file contents.
- Verification: 22 focused tests pass across 3 suites with mocked DB/provider; Prisma 5.22 client generation passes; frontend production build passes. Vite upgraded to 7.3.7 / React plugin 5.2.0, removing high advisories. Backend install audit: zero; frontend: 5 moderate remain (Router / Tailwind-PostCSS chains). Hosted CI has not run.
- Pending: user supplies separate Neon development/test URLs and xAI key privately in server `.env`; then migrate dev/test, seed dev only, run existing integration suite, verify one complete sale and live Grok tools. Continue responsive/browser QA, remaining dependency upgrades, dedicated staff-only demo setup, deployment and portfolio proof afterward.
- Detailed setup: `docs/local-setup.md`. Findings/status: `docs/issue-register.md`. Phase gates remain open until real checks pass.

- Layout: all project files, Git history, dependencies and private env files moved into workspace root; nested folder removed. The empty auto-created root Git metadata was preserved at `/tmp/stockwise-empty-git-syfoeh8s/.git`.
