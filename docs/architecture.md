# Architecture

## System Overview
StockWise AI is a full-stack MERN application organized into two packages:
- **`client/`**: React 18 single-page application (Vite + React Router 6 + TailwindCSS + Recharts) implementing the 7 required views (`Home`, `Login`, `Dashboard`, `Products & Inventory`, `Sales & Customers`, `AI Insights`, `Settings`).
- **`server/`**: Express 4 REST API using Mongoose 7 ODM, JWT authentication, `express-validator` request validation, transactional POS checkout, and an embedded time-series demand forecasting engine.

## Request & Transaction Flow
```text
Browser (React SPA)
  │  Authorization: Bearer <JWT>
  ▼
Express Router (/api/*)
  ├─ Middleware: CORS, JSON body parser, protect / adminOnly JWT guards
  ├─ /api/sales (POST) ──► MongoDB ClientSession (withTransaction)
  │                         ├─ 1. Consolidate duplicate items & deduct Product.stock ($inc)
  │                         ├─ 2. Update/create Customer totals
  │                         ├─ 3. Increment Counter ('invoiceNumber')
  │                         └─ 4. Insert Sale & StockLog documents
  └─ /api/ai/insights  ──► Holt Linear Exponential Smoothing + Walk-Forward MAE Evaluation
```

## Database Connection Policy (`server/config/db.js`)
- **Production & Development:** Requires a persistent `MONGO_URI` (e.g., MongoDB Atlas replica set). Connection failures throw an explicit error rather than silently falling back to ephemeral storage.
- **Automated Testing (`NODE_ENV=test`):** Uses `MongoMemoryReplSet` (1-node replica set) so all multi-document transactions and rollbacks are verified in isolation without touching external databases.
- **Explicit Local Demo (`USE_IN_MEMORY_DB=true`):** Opt-in mode for sandbox environments where no local `mongod` is installed.
