# StockWise AI — Smart Inventory & Sales Management

> Full-stack inventory, POS checkout, customer tracking, and time-series demand forecasting system built with React, Node.js/Express, PostgreSQL, and Prisma ORM.

**Repository:** [https://github.com/meherabmehu/stockwise-ai](https://github.com/meherabmehu/stockwise-ai)

---

## Overview & Key Features

### Seven-Page Frontend Architecture
1. **Home (`/`) — Public:** Overview of core capabilities, interactive preview cards, Features, About, and Administrator Contact form.
2. **Login (`/login`):** JWT email/password authentication with input validation, password visibility toggle, and explicit indication that third-party OAuth is disabled.
3. **Dashboard (`/dashboard`):** KPI summary cards (`Total Products`, `Total Sales`, `Total Revenue & Profit`, `Low Stock Items`), interactive `Sales Overview` area chart (`Recharts`), date/range filters, low-stock alert bell, and `Recent Sales` table.
4. **Products & Inventory (`/products`):** Paginated product catalog, search, category & status filters, `Low Stock` filter tab, `Stock History` ledger tab, `Categories` valuation tab, Product CRUD modal, and atomic integer stock adjustment modal (`±Stock`).
5. **Sales & Customers (`/sales`, `/customers`):** Three-column POS checkout with cart management, automatic stock deduction, customer selector, `Sales History` ledger, and `Customers` CRUD with purchase history inspection.
6. **AI Insights (`/ai-insights`):** Time-series demand forecasting (`Holt's Double Exponential Smoothing`), 14-day stockout probability (`%`), 95% service-level reorder suggestions, slow-moving inventory capital detection, and walk-forward model evaluation (`MAE` vs. 7-day SMA baseline).
7. **Settings (`/settings`):** Profile management, business configuration (`Currency`, `Tax Rate`, `Low-Stock Threshold`), password update with current-password verification, and notification preferences.

### Backend & Relational Database Guarantees
- **ACID Sales Transactions (`PostgreSQL + Prisma`):** Checkout (`POST /api/sales`) consolidates duplicate product entries, verifies stock atomically with row-level conditional updates (`UPDATE "products" SET "stock" = "stock" - qty WHERE "id" = $1 AND "stock" >= qty`), increments the `Counter` invoice sequence (`INV-XXXX`), updates `Customer` totals, creates the `Sale` and `SaleItem` records, and writes `StockLog` audit entries inside a single PostgreSQL interactive transaction (`prisma.$transaction`).
- **Relational Integrity & Foreign Keys:** Enforces foreign-key constraints across `users`, `products`, `customers`, `sales`, `sale_items`, `stock_logs`, and `settings`, including `ON DELETE RESTRICT` on `sale_items.productId` so products with recorded sales history cannot be deleted.
- **Persistent PostgreSQL Configuration:** Connects via `DATABASE_URL` and fails fast in production when `DATABASE_URL` is missing rather than silently losing data in memory.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 18, Vite 5, React Router 6, TailwindCSS, Recharts, Axios |
| **Backend** | Node.js, Express 4, Prisma ORM (`@prisma/client` 5), JSON Web Tokens (`jsonwebtoken`), `bcryptjs`, `express-validator` |
| **Database** | PostgreSQL (`stockwise` primary database; `stockwise_test` isolated test database) |
| **AI / ML** | Walk-forward grid-searched Holt Linear Exponential Smoothing + Gaussian Stockout Risk model (`server/utils/aiInsights.js`) |
| **Testing** | Jest 29 + Supertest against isolated PostgreSQL test database (`stockwise_test`) |

---

## Installation & Running Instructions

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ running locally or remotely

### 1. Clone the Repository
```bash
git clone https://github.com/meherabmehu/stockwise-ai.git
cd stockwise-ai
```

### 2. Create PostgreSQL Databases
Create the application and test databases in PostgreSQL:
```bash
psql -U postgres -c "CREATE DATABASE stockwise;"
psql -U postgres -c "CREATE DATABASE stockwise_test;"
```

### 3. Configure, Migrate & Start the Backend
```bash
cd server
npm install
cp .env.example .env
# Edit .env and set DATABASE_URL="postgresql://USER@HOST:5432/stockwise?schema=public" and JWT_SECRET

npx prisma generate       # Generates Prisma Client
npx prisma migrate dev    # Applies SQL migrations in server/prisma/migrations
npm run seed              # Seeds initial admin account, products, customers, and historical sales
npm run dev               # Starts API server on http://localhost:5000
```

### 4. Configure & Start the Frontend
```bash
cd ../client
npm install
cp .env.example .env
npm run dev               # Starts Vite dev server on http://localhost:5173
```

---

## AI/ML Demand Forecasting Methodology

Implemented in `server/utils/aiInsights.js` (`GET /api/ai/insights`):

1. **Input Preparation:** Aggregates historical `Sale` and `SaleItem` records from PostgreSQL over the trailing 30 days into a chronological daily demand vector $y_0, y_1, \dots, y_{29}$ per product.
2. **Model Training & Selection:** Fits **Holt's Linear Exponential Smoothing** ($\ell_t = \alpha y_t + (1-\alpha)(\ell_{t-1}+b_{t-1})$, $b_t = \beta(\ell_t-\ell_{t-1}) + (1-\beta)b_{t-1}$) per product by grid-searching $(\alpha, \beta)$ to minimize walk-forward one-step-ahead Mean Absolute Error ($\text{MAE}_{\text{model}}$).
3. **Stockout Risk & Safety Stock:** Projects 14-day cumulative demand $\hat{D}_{14} = \sum_{h=1}^{14} \max(0, \ell_T + h b_T)$, estimates 14-day residual standard deviation $\hat{\sigma}_{14}$, computes 95% service-level safety stock ($1.645\,\hat{\sigma}_{14}$), and calculates calibrated stockout probability $P(D_{14} > \text{stock})$ via the Gaussian CDF.
4. **Baseline Evaluation:** Compares walk-forward $\text{MAE}_{\text{model}}$ and $\text{RMSE}_{\text{model}}$ against a 7-day Simple Moving Average ($\text{MAE}_{\text{baseline}}$) on the same out-of-sample window and exposes the evaluation metrics in `modelEvaluation`.

---

## Automated Testing

Apply migrations to the test database (first time only) and run the backend integration & concurrency test suite:
```bash
cd server
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/stockwise_test?schema=public" npx prisma migrate deploy
npm test
```

Verify the frontend production bundle:
```bash
cd client
npm run build
```

---

## Documentation Index

- [`docs/architecture.md`](docs/architecture.md) — System architecture, PostgreSQL + Prisma transaction flow, and state management
- [`docs/api-documentation.md`](docs/api-documentation.md) — REST API endpoints, UUID request/response schemas, and error codes
- [`docs/database-design.md`](docs/database-design.md) — PostgreSQL relational tables, foreign keys, indexes, and ACID transaction boundaries
- [`docs/demo-checklist.md`](docs/demo-checklist.md) — Pre-demo verification steps
- [`docs/known-limitations.md`](docs/known-limitations.md) — Known constraints and production considerations
