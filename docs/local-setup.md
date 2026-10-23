# Local setup: Neon + Grok

## Private configuration

Use Node.js 22.12+ or 24 LTS (frontend Vite 7 requirement). Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env` if these files do not exist. This workspace already has both local files; the server file has a generated JWT secret and private seed password. Keep these files out of Git and screenshots.

In Neon, create dedicated development and test databases or branches containing only fictional data. Do not point either URL at a business/production database. In `server/.env`:

- Set `DATABASE_URL` to the development connection string from Neon.
- Set `TEST_DATABASE_URL` to a different database or branch's connection string. Tests deliberately erase this target's data. The guard compares database targets, including pooled/direct aliases of a Neon endpoint.
- Keep SSL enabled (`sslmode=require`). Preserve the connection options Neon supplies. Modern Neon pooling works with this project's Prisma version; see [Neon's Prisma guidance](https://neon.com/blog/better-postgres-with-prisma-experience).
- Keep the generated `JWT_SECRET` and `SEED_ADMIN_PASSWORD`, or supply your own private values. Set `SEED_ADMIN_EMAIL` to the owner login you will use locally.
- Put your xAI API key in `AI_API_KEY`. Default model is `grok-4.7`; change `AI_MODEL` if your account uses another tool-capable model. See [xAI Chat Completions](https://docs.x.ai/developers/model-capabilities/legacy/chat-completions). Leaving the key empty is supported.

The frontend only needs `VITE_API_URL=http://localhost:5000/api`. Never put an AI key in a `VITE_*` variable.

## Install, migrate, seed, run

Backend, from `server/`:

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm run seed
npm start
```

Seeding is explicit and non-destructive by default; an existing user prevents ordinary reseeding. There is no automatic startup seed. `SEED_FORCE=true` deletes data, so reserve it for disposable databases. Production seeding is blocked unless explicitly enabled with `ALLOW_PRODUCTION_SEED=true`; this is not a routine deployment step.

Frontend, in another terminal from `client/`:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Sign in with the private seed credentials in your local server environment. No admin credentials are embedded in the frontend.

## Verification

From `server/`:

```sh
npm run test:unit
npm run test:prepare
npm run test:integration
```

`test:prepare` migrates only `TEST_DATABASE_URL`. Both preparation and integration reject a missing test URL or a target matching development. Integration uses explicit test-only seed credentials without changing the local environment file. `npm test` runs unit and integration suites together.

From `client/`, run `npm run build`.

`GET /api/health` is liveness; `GET /api/ready` queries PostgreSQL and returns 503 if unavailable. Live Grok verification requires a configured key; unit tests only mock the provider.

## Public portfolio deployment

Use a third database/branch with fictional demo data, HTTPS API/frontend URLs, a strong JWT secret, and `CLIENT_URL` matching the exact frontend origin. Set `DEMO_READ_ONLY=true` on the API. This blocks business mutations, registration, and settings/password updates while allowing sign-in and read-only assistant queries. It does not turn an admin into a staff user: create a dedicated staff account privately before enabling demo mode. Never publish the owner/admin credentials.

Keep an unrestricted local environment for recording POS and inventory edits. The public read-only demo cannot complete sales; use the walkthrough video to show that workflow. Validate the public deployment separately before claiming it is ready.
