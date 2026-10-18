# Architecture

## Overview
StockWise AI is a MERN-style full-stack app with clear separation:

- **Client**: React 18 SPA (Vite) — 7 pages + reusable layout (Sidebar + Header). Uses React Router for navigation, Context for auth, Axios for API calls, Recharts for analytics.
- **Server**: Express REST API — JWT auth, Mongoose ODM, modular routers, centralized error handler.
- **DB**: MongoDB (Atlas or local) with 5 collections.

## Request Flow
```
Browser -> React Router -> Axios -> Express (middleware: cors, json, auth) -> Controller -> Mongoose -> MongoDB
                                      |
                                      -> AI Engine (aggregation on Sale + Product)
```

## Folder Responsibilities
- `server/config/db.js` — Mongo connection with retry
- `server/middleware/auth.js` — verify JWT, attach req.user
- `server/routes/*.js` — thin route layer, validation via express-validator
- `server/models/*.js` — schemas with indexes and hooks
- `server/utils/aiInsights.js` — pure functions that read DB and return insights

## Auth Flow
1. POST /api/auth/login with email/password → bcrypt compare → sign JWT (7d) → return token + user
2. Client stores token in localStorage, sends `Authorization: Bearer <token>` on protected calls
3. Middleware verifies and loads user; Admin role required for most writes.

## State Management
- AuthContext holds user/token, persists to localStorage
- Each page fetches via useEffect + loading/error/empty states
- Forms use controlled inputs with client validation before API call

## Deployment
- Client: Vercel static, env VITE_API_URL
- Server: Render Node service, env MONGO_URI, JWT_SECRET, CLIENT_URL (CORS allowlist)

## Scalability Notes
- Pagination on Products (limit/skip) and Sales
- Indexes on Product.category, Sale.createdAt, Customer.email
- AI engine uses aggregation pipelines to avoid N+1
