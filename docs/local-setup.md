# Local setup: Neon + Groq

## Private configuration

Use Node.js 22.12+ or 24 LTS (frontend Vite 7 requirement). Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env` if these files do not exist. This workspace already has both local files; the server file has a generated JWT secret and private seed password. Keep these files out of Git and screenshots.

This portfolio uses one Neon database containing only fictional demo data. There is no local test connection. In `server/.env`:

- Set `DATABASE_URL` to the demo connection string from Neon.
- Leave `TEST_DATABASE_URL` empty. GitHub Actions creates disposable PostgreSQL for the full integration suite; it does not use Neon.
- Keep SSL enabled (`sslmode=require`). Preserve the connection options Neon supplies. Modern Neon pooling works with this project's Prisma version; see [Neon's Prisma guidance](https://neon.com/blog/better-postgres-with-prisma-experience).
- Keep the generated `JWT_SECRET` and `SEED_ADMIN_PASSWORD`, or supply your own private values. Set `SEED_ADMIN_EMAIL` to the owner login you will use locally.
- Put your Groq API key in `AI_API_KEY`. Default model is `openai/gpt-oss-20b`; change `AI_MODEL` if your account uses another tool-capable model. See [Groq Chat Completions](https://console.groq.com/docs/tool-use/overview). Leaving the key empty is supported.

The frontend only needs `VITE_API_URL=http://localhost:5001/api`. Never put an AI key in a `VITE_*` variable.

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
npm test
```

`npm test` runs mocked safety/provider tests without touching Neon. GitHub Actions separately runs `test:prepare` and `test:integration` against its disposable database. Local integration testing remains blocked without an explicitly isolated `TEST_DATABASE_URL`.

From `client/`, run `npm run build`.

`GET /api/health` is liveness; `GET /api/ready` queries PostgreSQL and returns 503 if unavailable. Live Groq verification requires a configured key; unit tests only mock the provider.

## Public portfolio deployment

Use the configured fictional-data Neon database, HTTPS API/frontend URLs, a strong JWT secret, and `CLIENT_URL` matching the exact frontend origin. Set `DEMO_READ_ONLY=true` on the API. This blocks business mutations, registration, and settings/password updates while allowing sign-in and read-only assistant queries. It does not turn an admin into a staff user: run `npm run demo:prepare` after setting private `DEMO_LOGIN_EMAIL` and `DEMO_LOGIN_PASSWORD` values. These are already prepared locally. Never publish the owner/admin credentials.

Keep an unrestricted local environment for recording POS and inventory edits. The public read-only demo cannot complete sales; use the walkthrough video to show that workflow. Validate the public deployment separately before claiming it is ready.

Port 5001 avoids macOS Control Center/AirPlay using port 5000. Cloud transactions allow 30 seconds, with a 60-second normal client request timeout. Assistant requests allow up to 250 seconds for the bounded tool rounds.

## Optional Google sign-in

See [Google setup](google-login.md) to create a Web OAuth client and configure `GOOGLE_CLIENT_ID`. Existing password login remains available until this is configured. Google sign-in only admits invited accounts; it never grants a role based on browser input.
