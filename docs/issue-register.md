# Launch issue register

Audit: 24 October 2026; original source `da19cbb`, current repository baseline `705a89e`. Status reflects local evidence only.

| Severity | Area | Reproduction / expected vs actual | Owner | Status |
| --- | --- | --- | --- | --- |
| P0 | CORS | Browser origin other than CLIENT_URL was accepted; expect exact-origin policy | Project maintainer | Fixed locally; allow/deny tests pass |
| P0 | Login / seed | Login UI filled a published admin password; seeder used a default and created a second admin | Project maintainer | Autofill/defaults/second admin removed; existing deployed credentials, if any, still require rotation |
| P0 | Seed command | Routine seed forced deletion unless explicitly disabled; expect non-destructive default | Project maintainer | Default fixed; startup seed removed; private credentials validated before DB access |
| P0 | Test data safety | Suite could fall back to DATABASE_URL and force-delete business data | Project maintainer | Dedicated test URL required; same-target and Neon pooled/direct alias checks pass |
| P0 | Public demo writes | Staff role alone permits checkout and other writes; expect read-only public demo | Project maintainer | Server-enforced DEMO_READ_ONLY added and tested; dedicated staff account created; live write rejection verified; public hosting verification pending |
| P1 | Reproducibility / CI | Lockfiles ignored and no workflow present | Project maintainer | Both lockfiles generated; workflow added; hosted CI not yet run |
| P1 | Readiness | Health response did not query DB | Project maintainer | Separate /api/ready query and sanitized 503 added; mocked checks and live Neon readiness pass |
| P1 | Dependencies | Initial frontend audit reported 7 vulnerabilities (1 high); expect supported/patched dependencies | Project maintainer | Vite upgraded to 7.3.7 with React plugin 5.2.0, eliminating high-severity findings. Router upgraded to 7.18.4 and CSS parser overridden to patched 7.1.7; frontend audit now zero; production build and responsive browser sweep pass. Backend install audit reported zero |
| P1 | Database baseline | No configured Neon URLs; expected migrations, integration tests, verified sale | User / project maintainer | One Neon demo database connected, migrated and seeded without force; login and browser checkout pass. User declined local test connection; integration is CI-only |
| P1 | AI provider verification | User key belonged to Groq but requests went to xAI | Project maintainer | Corrected endpoint/model to Groq; live inventory tool-call turn passes (HTTP 200); mocked tests pass |
| P2 | Documentation | README and demo checklist advertised different static test counts | Project maintainer | Removed stale counts; current run evidence below |

## Verification evidence

- `npm run test:unit`: 22 tests pass across 3 suites (mocked DB/provider).
- `npx prisma generate`: passes with Prisma 5.22.
- `npm run build` in client: passes.
- `git diff --check`: passes; both local `.env` files are Git-ignored.
- Live Neon migrations/seed, API smoke and Chromium checkout/responsive checks pass. Five portfolio screenshots plus a read-only demo screenshot and an 89-second captioned walkthrough captured.
- Live Groq authentication and inventory tool-call smoke pass after correcting provider. Not run: full PostgreSQL suite on local demo (intentionally skipped), public deployment and hosted CI for these changes.

## Additional accepted portfolio checks

Keep scope fixed. Verify concurrent checkout, duplicate submissions, insufficient stock and rollback; isolate fictional public-demo data and document reset procedures. The existing suite already contains checkout concurrency/rollback coverage; executing it is delegated to disposable PostgreSQL in CI, never the single Neon demo database. Assess duplicate-submission behavior against the actual API before changing its contract.

For current live verification and external gates, see `verification.md`. Duplicate HTTP checkout retries are not guaranteed idempotent; the UI prevents ordinary repeat submissions while a request is pending.
