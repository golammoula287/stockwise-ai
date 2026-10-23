# Launch issue register

Audit: 24 October 2026, source commit `da19cbb`. Status reflects local evidence only.

| Severity | Area | Reproduction / expected vs actual | Owner | Status |
| --- | --- | --- | --- | --- |
| P0 | CORS | Browser origin other than CLIENT_URL was accepted; expect exact-origin policy | Project maintainer | Fixed locally; allow/deny tests pass |
| P0 | Login / seed | Login UI filled a published admin password; seeder used a default and created a second admin | Project maintainer | Autofill/defaults/second admin removed; existing deployed credentials, if any, still require rotation |
| P0 | Seed command | Routine seed forced deletion unless explicitly disabled; expect non-destructive default | Project maintainer | Default fixed; startup seed removed; private credentials validated before DB access |
| P0 | Test data safety | Suite could fall back to DATABASE_URL and force-delete business data | Project maintainer | Dedicated test URL required; same-target and Neon pooled/direct alias checks pass |
| P0 | Public demo writes | Staff role alone permits checkout and other writes; expect read-only public demo | Project maintainer | Server-enforced DEMO_READ_ONLY added and tested; dedicated staff account and deployment verification pending |
| P1 | Reproducibility / CI | Lockfiles ignored and no workflow present | Project maintainer | Both lockfiles generated; workflow added; hosted CI not yet run |
| P1 | Readiness | Health response did not query DB | Project maintainer | Separate /api/ready query and sanitized 503 added; mocked checks pass, live Neon check pending |
| P1 | Dependencies | Initial frontend audit reported 7 vulnerabilities (1 high); expect supported/patched dependencies | Project maintainer | Vite upgraded to 7.3.7 with React plugin 5.2.0, eliminating high-severity findings. Remaining: 5 moderate findings in React Router and Tailwind/PostCSS chains; browser regression/upgrade work pending. Backend audit reported zero |
| P1 | Database baseline | No configured Neon URLs; expected migrations, integration tests, verified sale | User / project maintainer | Blocked on private local development/test connection configuration |
| P1 | Grok live verification | No xAI key configured; expect real approved-tool conversation | User / project maintainer | Grok defaults and mocked request/tool/error tests pass; live check pending |
| P2 | Documentation | README and demo checklist advertised different static test counts | Project maintainer | Removed stale counts; current run evidence below |

## Verification evidence

- `npm run test:unit`: 22 tests pass across 3 suites (mocked DB/provider).
- `npx prisma generate`: passes with Prisma 5.22.
- `npm run build` in client: passes.
- `git diff --check`: passes; both local `.env` files are Git-ignored.
- Not run: actual Neon migrations/seed, existing PostgreSQL integration suite, real Grok requests, browser acceptance, deployment, hosted CI.

## Additional accepted portfolio checks

Keep scope fixed. Verify concurrent checkout, duplicate submissions, insufficient stock and rollback; isolate fictional public-demo data and document reset procedures. The existing suite already contains checkout concurrency/rollback coverage; executing it is pending database configuration. Assess duplicate-submission behavior against the actual API before changing its contract.
