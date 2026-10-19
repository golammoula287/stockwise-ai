# StockWise AI — Smart Inventory & Sales Management System

> Full-stack inventory, POS checkout, customer tracking, and calibrated time-series demand forecasting system built with React, Node.js/Express, PostgreSQL, and Prisma ORM.

**Repository:** [https://github.com/meherabmehu/stockwise-ai](https://github.com/meherabmehu/stockwise-ai)

---

## Overview & Key Features

### Seven-Page Frontend Architecture
1. **Home (`/`) — Public:** Overview of core capabilities, interactive preview cards, Features, About, and Administrator Contact form.
2. **Login (`/login`) — Public:** JWT email/password authentication with login rate limiting, input validation, password visibility toggle, and explicit indication that third-party OAuth is disabled.
3. **Dashboard (`/dashboard`) — Protected:** KPI summary cards (`Total Products`, `Sales`, `Revenue & Profit`, `Low Stock Items`), interactive `Sales Overview` area chart (`Recharts`) with `This Year` (monthly) and `Last 30 Days` (3-day interval) views, live date range filters (`This Month`, `Last 30 Days`, `Last 7 Days`, `Today`, `All Time`), low-stock alert bell, and `Recent Sales` table.
4. **Products & Inventory (`/products`) — Protected:** Paginated product catalog with unique `SKU` badges, search (by name, SKU, or category), category/status/sort filters, `Low Stock` filter tab, `Stock History` audit ledger tab, `Categories` valuation tab, Product CRUD modal (`Admin`), and atomic integer stock adjustment modal (`±Stock`, `Admin`).
5. **Sales & Customers (`/sales`, `/customers`) — Protected:** Three-column POS checkout with cart management, automatic stock deduction, Business Settings tax rate integration, payment method selection (`Cash`, `Card`, `bKash`, `Other`), walk-in default reset after checkout, `Sales History` ledger, and `Customers` CRUD with reconciled purchase history inspection.
6. **AI Insights (`/ai-insights`) — Protected:** Calibrated 14-day demand forecasting (`Holt's Double Exponential Smoothing` with sparse-demand damping), explicit separation of `Low-Stock Threshold Alerts` vs. `Proactive Forecast Reorders`, 7-day lead-time Reorder Point (`ROP`) & 95% service-level safety stock, calibrated Gaussian stockout risk $P(D_{14} > \text{stock})$, slow-moving inventory capital detection, and walk-forward model evaluation (`MAE` & `RMSE` vs. 7-day SMA baseline).
7. **Settings (`/settings`) — Protected:** Profile management with unique email & phone validation, business configuration (`Business Name`, `Currency`, `POS Sales Tax Rate %`, `Default Low-Stock Threshold`), password update with current-password verification and session token refresh, and active system preferences (`Low-Stock Alert Notifications`, `Automated AI Reorder Suggestions`).

---

## Security & Database Guarantees

- **Strict JWT Authentication & RBAC:** All private endpoints (`/api/products*`, `/api/sales*`, `/api/customers*`, `/api/dashboard*`, `/api/ai*`, `/api/settings*`) require a valid `Authorization: Bearer <JWT>` header. Missing, malformed, invalid, or expired tokens return `401 Unauthorized`. Administrative mutations (`POST/PUT/PATCH/DELETE /api/products`, `DELETE /api/customers/:id`, `POST /api/auth/register`) enforce `adminOnly` (`403 Forbidden` for staff accounts).
- **Brute-Force Rate Limiting:** `POST /api/auth/login` enforces a sliding-window rate limiter (`429 Too Many Requests` with `Retry-After` header).
- **ACID Sales Transactions (`PostgreSQL + Prisma`):** Checkout (`POST /api/sales`) consolidates duplicate product entries, locks and decrements product stock in deterministic UUID order (`UPDATE "products" SET "stock" = "stock" - qty WHERE "id" = $1 AND "stock" >= qty`), computes subtotal/discount/tax/profit, increments `Counter` (`INV-XXXX`), updates `Customer` totals, creates `Sale` + `SaleItem` records, and writes `StockLog` audit entries inside a single PostgreSQL interactive transaction (`prisma.$transaction`).
- **Relational Integrity & Unique SKUs:** Enforces unique product SKUs (`@unique`), foreign-key constraints across all 8 tables, `ON DELETE RESTRICT` on `sale_items.productId` (preventing deletion of products with sales history), and automatic reconciliation of `customer.totalOrders` and `customer.totalSpent` against recorded `Sale` invoices.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 18, Vite 5, React Router 6, TailwindCSS, Recharts, Axios |
| **Backend** | Node.js, Express 4, Prisma ORM (`@prisma/client` 5.22.0), JSON Web Tokens (`jsonwebtoken`), `bcryptjs`, `express-validator` |
| **Database** | PostgreSQL (`stockwise` development/production database; `stockwise_test` isolated test database) |
| **AI / ML** | Walk-forward grid-searched Holt Linear Exponential Smoothing + Sparse-Demand Damping + Calibrated Gaussian Stockout Risk (`server/utils/aiInsights.js`) |
| **Testing** | Jest 29 + Supertest (26 automated security, transaction, concurrency, and AI forecasting tests) |

---

## Installation & Development Instructions

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ running locally or remotely

### 1. Clone the Repository
```bash
git clone https://github.com/meherabmehu/stockwise-ai.git
cd stockwise-ai
```

### 2. Create PostgreSQL Databases
Create the application and isolated test databases in PostgreSQL:
```bash
psql -U postgres -c "CREATE DATABASE stockwise;"
psql -U postgres -c "CREATE DATABASE stockwise_test;"
```

### 3. Configure, Migrate & Start the Backend
**Linux / macOS:**
```bash
cd server
npm install
cp .env.example .env
# Edit .env and set DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/stockwise?schema=public" and JWT_SECRET

npx prisma generate
npx prisma migrate deploy
npm run seed
npm run dev
```

**Windows PowerShell:**
```powershell
cd server
npm install
Copy-Item .env.example .env
# Edit .env and configure DATABASE_URL and JWT_SECRET

npx prisma generate
npx prisma migrate deploy
npm run seed
npm run dev
```

### 4. Configure & Start the Frontend
```bash
cd ../client
npm install
npm run dev
```

---

## AI/ML Demand Forecasting Methodology & Assumptions

Implemented in `server/utils/aiInsights.js` (`GET /api/ai/insights`):

1. **Calendar-Day Time-Series Construction:** Queries PostgreSQL `Sale` and `SaleItem` records over the trailing 30 calendar days (`startWindow` at `00:00:00` 29 days ago through `endOfToday` at `23:59:59.999`) and populates a 30-day vector $y_0, y_1, \dots, y_{29}$ per product, explicitly zero-filling days without sales.
2. **Walk-Forward Holt Model & Sparse-Demand Protection:**
   - Evaluates **Holt's Linear Exponential Smoothing** ($\ell_t = \alpha y_t + (1-\alpha)(\ell_{t-1}+b_{t-1})$, $b_t = \beta(\ell_t-\ell_{t-1}) + (1-\beta)b_{t-1}$) via grid search over $(\alpha, \beta)$ on out-of-sample steps $t = 7 \dots 29$ (23 steps) with zero look-ahead data leakage.
   - Compares walk-forward $\text{MAE}_{\text{model}}$ against a 7-day Simple Moving Average ($\text{MAE}_{\text{baseline}}$) on the identical out-of-sample window.
   - For sparse/intermittent demand ($\le 2$ active sales days in 30 days), applies damped trend ($\phi = 0.5$) blended with empirical daily velocity so single-day spikes do not extrapolate into unrealistic 14-day forecasts.
3. **Separate Inventory Planning Quantities:**
   - **Continuous vs. Rounded Forecast:** Reports both `forecast14dContinuous` ($\hat{\mu}_{14}$) and integer `forecast14d`.
   - **7-Day Lead Time & Safety Stock:** Computes 7-day lead-time demand $\hat{D}_7$, 95% service-level safety stock $\text{SS} = \max(\lceil 1.645\,\hat{\sigma}_7 \rceil, \text{threshold})$, and Reorder Point $\text{ROP} = \hat{D}_7 + \text{SS}$.
   - **Threshold vs. Forecast Triggers:** Distinguishes static low-stock threshold alerts (`triggerType: 'threshold'`) from proactive demand-forecast reorders (`triggerType: 'forecast'`).
4. **Calibrated Stockout Probability:**
   - Computes $P(D_{14} > \text{stock}) = \Phi\left(\frac{\hat{\mu}_{14} - \text{stock}}{\hat{\sigma}_{14}}\right)$ where $\hat{\sigma}_{14} = \max(\sqrt{14}\hat{\sigma}_{\text{residual}}, \sqrt{\max(\hat{\mu}_{14}, 1.5)}, 1.5)$.
   - When $\hat{\mu}_{14} = \text{stock}$, stockout probability is $50\%$ (`Moderate`), avoiding overconfident $90\%+$ risk labels; when 30-day demand is $0$ and $\text{stock} > 0$, 14-day stockout risk is calibrated below $15\%$.

---

## Automated Testing

Apply migrations to the isolated test database (`stockwise_test`) and run the 26-test backend suite:
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

- [`docs/architecture.md`](docs/architecture.md) — System architecture, authentication flow, and PostgreSQL transaction design
- [`docs/api-documentation.md`](docs/api-documentation.md) — Protected REST API endpoints, request/response schemas, and error codes
- [`docs/database-design.md`](docs/database-design.md) — PostgreSQL relational tables, foreign keys, SKU constraints, and ACID boundaries
- [`docs/demo-checklist.md`](docs/demo-checklist.md) — Pre-deployment & demo verification checklist
- [`docs/known-limitations.md`](docs/known-limitations.md) — Forecasting assumptions, limitations, and production considerations
