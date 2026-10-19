# Architecture

## System Overview
StockWise AI is a full-stack relational web application organized into two packages:
- **`client/`**: React 18 single-page application (Vite + React Router 6 + TailwindCSS + Recharts) implementing the 7 required views (`Home`, `Login`, `Dashboard`, `Products & Inventory`, `Sales & Customers`, `AI Insights`, `Settings`).
- **`server/`**: Express 4 REST API using PostgreSQL and Prisma ORM (`@prisma/client`), JWT authentication, `express-validator` request validation, ACID transactional POS checkout, and an embedded time-series demand forecasting engine.

## Request & Transaction Flow
```text
Browser (React SPA)
  │  Authorization: Bearer <JWT>
  ▼
Express Router (/api/*)
  ├─ Middleware: CORS, JSON body parser, protect / adminOnly JWT guards
  ├─ /api/sales (POST) ──► PostgreSQL Interactive Transaction (prisma.$transaction)
  │                         ├─ 1. Consolidate duplicate items & deduct products.stock atomically
  │                         ├─ 2. Update/create Customer totals (totalSpent, totalOrders)
  │                         ├─ 3. Increment Counter ('invoiceNumber')
  │                         └─ 4. Insert Sale, SaleItem, & StockLog rows
  └─ /api/ai/insights  ──► Holt Linear Exponential Smoothing + Walk-Forward MAE Evaluation
```

## Database Connection Policy (`server/config/db.js`)
- **Production:** Requires an explicit `DATABASE_URL` pointing to a persistent PostgreSQL database. Missing configuration throws an explicit startup error.
- **Development:** Uses `DATABASE_URL` from `server/.env` (defaults to `postgresql://postgres:postgres@localhost:5432/stockwise?schema=public`).
- **Automated Testing (`NODE_ENV=test`):** Connects to an isolated PostgreSQL test database (`TEST_DATABASE_URL` or `postgresql://postgres:postgres@localhost:5432/stockwise_test?schema=public`) so all ACID transactions, rollbacks, and concurrency tests execute against real PostgreSQL tables without touching development or production data.
