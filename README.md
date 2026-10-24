# StockWise AI

### Inventory, sales, and customer records in one workspace.

StockWise AI is a full-stack retail management portfolio project. It brings together a product catalog, point-of-sale checkout, customer records, cash memos, sales reports, and demand insights in a responsive interface.

Built for a professional portfolio and an interactive Upwork demonstration. All sample business data is fictional.

[Repository](https://github.com/golammoula287/stockwise-ai) · [Setup](#run-locally) · [Demo access](#demo-access) · [Vercel deployment](#deploy-on-vercel) · [Documentation](#documentation)

## Live demo

**Live URL: pending the first successful Vercel deployment.**

Vercel is connected to this GitHub repository. After deployment, copy the production URL from the Vercel project dashboard and replace this status with a live link. No deployment URL has been verified yet.

Local frontend: [http://localhost:5173](http://localhost:5173)

## Preview

![Dashboard with selected-month revenue, profit, and revenue comparison](client/public/images/dashboard-preview.png)

| Inventory | Product sales insights |
| --- | --- |
| ![Product catalog with stock filters and SKU search](client/public/images/inventory-preview.png) | ![Product sales comparison and idle-stock analysis](client/public/images/insights-preview.png) |

| Cash memo | Customers |
| --- | --- |
| ![Printable cash memo from a fictional sale](client/public/images/invoice-preview.png) | ![Fictional customer directory](client/public/images/customers-preview.png) |

These are screenshots of the local application with browser demo data. They do not represent a hosted deployment or real business activity.

## Demo access

Open the live `/login` page when published, or `/login` on your local frontend.

| Account | Email | Password |
| --- | --- | --- |
| Public portfolio visitor | `visitor@stockwise.example` | `HNcwra_z0cyC5T9fNQNDB4t-2gkoTxBV` |

This dedicated staff account is intended for public demo access. In the interactive demo, business changes stay in the browser and reset on refresh or logout. It has no user-management privileges.

Select **Try demo** to explore the sample data. Select **Create an account** for a private workspace with zero products, customers and sales. New accounts administer their own business records, which are saved in PostgreSQL across refreshes and devices. They cannot manage platform users or access other accounts' records. Existing accounts retain their previous demo behavior.

**Owner access:** the provisioned app owner can open **Manage admins** after signing in. Each new admin gets **Manage staff** for their own workspace. Owner credentials are kept in the local, Git-ignored `docs/PRIVATE_ACCESS.md` file and are not published here.

Google sign-in appears when the OAuth configuration is complete. Email/password sign-in works independently.

## What you can do

### Dashboard

- Select a month and compare it with the previous month.
- Review revenue, profit, completed sales, and average sale value.
- Switch the revenue comparison between cumulative and daily views.
- Review top products, invoice payment status, recent sales, and customer balances.
- Open checkout, inventory, and reports from the dashboard.

### Products and inventory

- Add and edit products with names, SKUs, categories, prices, costs, and stock quantities.
- Search by product name or SKU, and filter or sort the catalog.
- Review low-stock and out-of-stock products.
- Record stock adjustments and inspect the stock movement history.
- Keep the standard product form or configure optional text, number, and dropdown fields.
- Use a separate SKU for each independently stocked variant.

### Checkout and customers

- Search products or scan an uploaded QR image/camera feed to locate a product.
- Add items to a cart, change quantities, and apply discounts and configured tax.
- Find a saved customer by name, phone, or email, or complete a walk-in sale.
- Choose a payment method and review the total before confirming the sale.
- Use full payment by default; optionally enable dues for saved customers.
- Collect outstanding payments from invoice details when dues are enabled.
- Browse customer records, purchase history, spending, and balances.

QR scanning locates products for review. It does not automatically complete checkout or open external links. Camera scanning requires browser permission and HTTPS or localhost; uploaded-image scanning is also available.

### Sales reports and cash memos

- Search invoices by number, customer name, or phone.
- Filter sales by all time, a month, or an inclusive date range.
- Export every matching sale as CSV, including results beyond the visible first page.
- Open an organized cash memo and print it or save it as PDF using the browser print dialog.
- Keep invoice totals, discounts, tax, paid amounts, and balances together.

Report date boundaries use Bangladesh time (`Asia/Dhaka`).

### AI Insights

- Analyze the last 7, 30, or 90 days, a month, or a custom range of up to 366 days.
- Review stock alerts, restock quantities, estimated order cost, revenue, and profit.
- Filter recommendations by priority and out-of-stock status.
- Compare product sales by revenue or units sold with an interactive bar chart.
- Inspect individual product quantities, revenue, and share of displayed sales.
- Identify in-stock products with no sales in the selected period.
- Export the complete insights report as CSV or a printable PDF.

**Calculation methods:** the interactive browser demo estimates future demand from selected-period average daily sales. The database-backed implementation uses Holt forecasting, reorder points, safety-stock calculations, and available walk-forward evaluation metrics. Demo estimates do not claim Holt validation scores or calculated stockout probabilities. Suggestions use **current stock**, even when analyzing a historical sales period. Forecasts are estimates, not guarantees.

### Groq business assistant

- Ask questions about the workspace in English or Bangla.
- In browser demo mode, the assistant receives a bounded fictional-data snapshot and has no database tools.
- The database-backed assistant has approved read-only tools for business lookups.
- Groq credentials stay on the server. Demand calculations work without a Groq key.

### Settings and account access

- Edit business settings, currency, tax, and notification preferences.
- Choose full-payment or optional-due checkout rules.
- Configure custom product fields.
- Choose a workspace background or upload a local image.
- Use confirmation dialogs before consequential inventory, sales, payment, and settings actions.

## Roles

| Role | Purpose |
| --- | --- |
| Demo visitor | Explore fictional browser data; temporary sample changes only. |
| Staff | Share their admin's workspace, view inventory/reports, handle checkout and maintain customers. Cannot edit inventory, passwords, business settings or product-field definitions, or manage accounts. |
| Private workspace admin | Manage their own saved business data and create, restrict, reset passwords for, or delete their own staff. Cannot manage other admins. |
| Legacy admin | Existing business actions, subject to the server's demo restrictions. |
| App owner | Manage admin accounts: create, search, rename, reset passwords, restrict/restore access and delete admin workspaces with their staff. |

The app owner is a legacy `admin` account matching the server-only `SUPER_ADMIN_EMAIL`. Access is checked on the server. Owner deletion and role changes are blocked. Restricting an admin blocks their staff too and revokes existing sessions; restoring access requires fresh sign-in. Individually restricted staff remain restricted. Deleting an admin permanently removes that private workspace's products, customers, sales, stock history and staff accounts in one transaction, after confirmation. Deleting an individual staff account preserves business history. Existing unassigned legacy accounts are not automatically attached to a new admin.

User administration and registration affect actual account records in Neon. Product, customer, checkout, and business-setting changes in the interactive demo are browser-only.

## How the demo stays useful

Each fresh demo session starts with:

- **12 products** across several retail categories.
- **8 fictional customers**.
- **360 fully paid sales** covering the latest **180 calendar days**.
- Multi-item orders, discounts, cash/card/bKash payments, and idle inventory.

Dates are generated relative to today. The demo remains useful in future months and years without manually changing seed dates. Current and previous-period charts have recent data.

A running session keeps its data until refresh or logout; it is not silently reset while you work. Background appearance is stored separately in the current browser. Sample sales are fully paid because the default business model requires full payment; enable dues to try partial-payment workflows.

## Technology

| Layer | Stack |
| --- | --- |
| Frontend | React 18, Vite, React Router, Tailwind CSS and custom CSS |
| Charts | Recharts |
| API | Node.js, Express |
| Database | PostgreSQL on Neon, Prisma ORM |
| Authentication | JWT, bcrypt, optional Google Identity Services |
| Assistant | Groq-compatible Chat Completions API |
| QR decoding | jsQR |
| Deployment | Vercel static frontend and Node API function |
| Verification | Node test runner, Jest, Supertest, local Chromium checks |

## Project structure

```text
stockwise-ai/
├── api/index.js                 # Vercel API entry
├── client/
│   ├── public/images/           # Hero imagery and current app previews
│   └── src/
│       ├── components/          # Shared UI, charts, dialogs, cash memo
│       ├── context/             # Authentication, demo mode, confirmations
│       ├── lib/                 # API adapter, browser demo, export helpers
│       └── pages/               # Home, login, dashboard, POS, insights, users
├── server/
│   ├── middleware/              # Authentication, permissions, demo guards
│   ├── prisma/                  # Schema and migrations
│   ├── routes/                  # REST endpoints
│   ├── scripts/                 # Explicit account/test preparation
│   ├── tests/                   # Mocked and database integration tests
│   └── utils/                   # Forecasting, assistant, business helpers
├── shared/                      # Shared analytics and date-period logic
├── docs/                        # Setup, verification, architecture, deployment
├── package.json                 # Root build and test commands
└── vercel.json                  # Frontend/API routing and build settings
```

## Run locally

### 1. Requirements

- Node.js **22.12+** and npm; Vercel is configured for Node **22.x**.
- A Neon PostgreSQL connection with SSL.
- Optional Groq API key and Google Web OAuth client ID.

This demo uses one fictional-data Neon database. Local unit tests use mocks and do not need a second database.

### 2. Clone and install

```bash
git clone https://github.com/golammoula287/stockwise-ai.git
cd stockwise-ai
npm ci --prefix server
npm ci --prefix client
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Edit the two local `.env` files before continuing. Do not overwrite existing environment files when updating a working installation.

### 3. Configure the API

Minimum `server/.env` values for the interactive portfolio demo:

```dotenv
NODE_ENV=development
PORT=5001
DATABASE_URL=postgresql://USER:PASSWORD@YOUR_NEON_ENDPOINT/neondb?sslmode=require
JWT_SECRET=replace_with_a_private_random_secret_at_least_32_characters
CLIENT_URL=http://localhost:5173
DEMO_READ_ONLY=true
TEST_DATABASE_URL=
```

Optional assistant configuration:

```dotenv
AI_API_KEY=your_private_groq_key
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-20b
AI_PROVIDER_TIMEOUT_MS=30000
```

The model must be available in your Groq account. If the assistant is unconfigured, the UI reports it; it does not invent an AI response.

For Google login, set `GOOGLE_CLIENT_ID` on the server and the same public ID in `VITE_GOOGLE_CLIENT_ID` on the client. Follow [Google login setup](docs/google-login.md).

### 4. Prepare the database and accounts

```bash
npm run prisma:generate --prefix server
npm run prisma:migrate --prefix server
```

Migrations apply the checked-in schema. Review the target database before running them. Routine startup and Vercel builds do not run seeds or migrations automatically.

Configure private `DEMO_LOGIN_EMAIL` and `DEMO_LOGIN_PASSWORD` values, then prepare the dedicated public **staff** login:

```bash
npm run demo:prepare --prefix server
```

For owner access, configure `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` privately, then run:

```bash
npm run admin:prepare --prefix server
```

This creates or updates only the specified owner account and resets its password. It does not erase or reseed business records. The browser's sample business data is generated automatically when demo mode is detected.

### 5. Start development

Run in separate terminals:

```bash
npm run dev --prefix server
```

```bash
npm run dev --prefix client
```

| Service | Local URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| API | http://localhost:5001/api |
| API health | http://localhost:5001/api/health |
| Database readiness | http://localhost:5001/api/ready |

The client can use `/api` through Vite's development proxy or the explicit local URL from `client/.env.example`.

## Tests and production build

From the repository root:

```bash
npm test
```

This runs the client tests and mocked server tests. Latest verified result: **30 client tests + 79 server tests = 109 passing tests**. Workspace persistence, category isolation and admin/staff cascade checks against disposable PostgreSQL are prepared for CI and have not been run locally; the three database migrations are now applied to the configured Neon database; hosted login verification is pending.

Coverage includes business totals, stock rules, optional dues, custom fields, selected periods, rolling future-dated sample data, exports, authentication, Google login, registration, and super-admin authorization.

Build the same-origin frontend and generate Prisma Client:

```bash
VITE_API_URL=/api npm run build
```

Output: `client/dist`. This command does not publish the app or change database records.

The database integration suite is separate:

```bash
npm run test:integration --prefix server
```

Run it only against a disposable PostgreSQL database prepared for tests. **Do not run the destructive integration suite against the shared Neon demo database.** CI provisions disposable PostgreSQL for integration checks.

Local Chromium checks cover responsive layouts, checkout/invoices, confirmation dialogs, charts, exports, QR-image lookup, owner sign-in, and user-management forms. Actual user-management mutations in those browser checks are mocked; authorization tests exercise the API using database mocks. See [verification evidence](docs/verification.md) for exact checks and pending items.

## Deploy on Vercel

The repository includes a single-project Vercel configuration for both frontend and API.

1. Import or select this GitHub repository in Vercel.
2. Keep **Root Directory** at the repository root and use **Other** for the framework preset.
3. Select Node.js **22.x**.
4. Add private environment variables in the Vercel dashboard.
5. Deploy the connected production branch.
6. Verify the public app and API, then add its live URL near the top of this README.

| Setting | Configuration |
| --- | --- |
| Install | `npm ci --prefix server && npm ci --prefix client` |
| Build | `VITE_API_URL=/api npm run build` |
| Static output | `client/dist` |
| API entry | `api/index.js` |
| Frontend deep links | SPA rewrite to `index.html` |
| Database | Existing Neon PostgreSQL database |

Required production variables include `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, the exact `CLIENT_URL`, `DEMO_READ_ONLY=true`, and `SUPER_ADMIN_EMAIL`. Add Groq and Google values only for enabled integrations. Keep database URLs, passwords, JWT secrets, and AI keys out of `VITE_*` variables.

When Vercel's Git integration is enabled, pushes to the configured production branch trigger deployments. This does not automatically edit the live URL in this README.

Full instructions: [Vercel deployment guide](docs/vercel-deployment.md). The local production build passes; hosted deployment and public-origin smoke checks remain pending.

## Important boundaries

- This is a portfolio demo with fictional business records.
- Browser demo changes are temporary; they are not saved as a permanent shop workspace.
- Custom fields are available in the browser demo; variants use separate SKUs rather than generated variant combinations.
- Camera QR scanning depends on the device and browser; real camera hardware has not been verified.
- Google consent must be verified after valid OAuth configuration is supplied.
- The browser-snapshot assistant's transport has been checked with mocks; live provider behavior must also be checked for the deployed environment.
- Vercel's API function is configured for a 60-second maximum. Slow provider calls need timeout tuning or a suitable backend host.
- In-memory API rate limits are per server/function instance. Use platform firewall rules or a shared limiter for dependable public abuse protection.
- Role management and account records are real; the public visitor is never granted super-admin access.

## Documentation

| Guide | Contents |
| --- | --- |
| [Local setup](docs/local-setup.md) | Environment, Neon, migrations, and local checks |
| [Interactive demo](docs/interactive-demo.md) | Browser-memory behavior and workflows |
| [Vercel deployment](docs/vercel-deployment.md) | Production configuration and post-publish checks |
| [Google login](docs/google-login.md) | OAuth setup and verification |
| [Verification](docs/verification.md) | Completed checks and remaining gaps |
| [Architecture](docs/architecture.md) | Frontend/API organization and data flows |
| [API reference](docs/api-documentation.md) | Existing REST and assistant endpoint contracts |
| [Database design](docs/database-design.md) | Schema, relations, and accounting records |
| [Known limitations](docs/known-limitations.md) | Scope and implementation limits |

## Author and contact

**Golam Moula**

- [GitHub](https://github.com/golammoula287)
- [Email](mailto:golammoula287@gmail.com)
- [WhatsApp](https://wa.me/8801708084799)

Built as an independent professional portfolio project. Sample results and screenshots demonstrate application behavior, not real clients, revenue, or forecast accuracy guarantees.
