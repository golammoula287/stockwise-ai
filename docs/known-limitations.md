# Known Limitations & Production Considerations

## 1. AI/ML Forecasting Scope & Assumptions
- **Statistical Time-Series Pipeline:** The forecasting engine (`server/utils/aiInsights.js`) buckets historical PostgreSQL `SaleItem` quantities into 30 consecutive calendar days (explicitly zero-filling days without sales) and evaluates **Holt's Double Exponential Smoothing** against a **7-day Simple Moving Average (SMA)** baseline over 23 out-of-sample walk-forward steps (`days 8–30`).
- **Sparse & Intermittent Demand Handling:** For products with 1–2 active sales days in the trailing 30 days, the pipeline applies damped trend ($\phi = 0.5$) blended with the empirical 30-day demand rate so single-order spikes cannot extrapolate into unrealistic 14-day forecasts.
- **Stockout Risk Calibration:** Stockout probability $P(D_{14} > \text{stock})$ is computed using a Gaussian CDF with a Poisson variance floor ($\hat{\sigma}_{14} \ge \sqrt{\hat{\mu}_{14}}$). It assumes a 7-day replenishment lead time and does not model multi-month holiday seasonality or external supplier disruptions.

## 2. Legacy Invoice Tax Records
- **Additive Tax Snapshot Schema (`20261019090000_add_sale_tax_snapshot`):** The `sales` table stores `taxRate` and `taxAmount` as nullable `DOUBLE PRECISION` columns. All sales created after this migration persist the exact checkout `taxRate` and `taxAmount`. Pre-migration legacy invoices retain `taxRate: null, taxAmount: null` (`isLegacyTax: true`) and are labeled `Legacy (—)` / `Not recorded` in the UI rather than fabricating historical tax rates.

## 3. Database & Rate Limiter Considerations
- **PostgreSQL + Prisma Migrations:** Schema changes must be applied via `npx prisma migrate dev` (development) or `npx prisma migrate deploy` (production/CI) before starting the server.
- **In-Memory Rate Limiter:** Login rate limiting (`server/middleware/rateLimit.js`) uses an in-process memory map suitable for single-instance deployments; horizontally scaled multi-instance deployments should back the rate limiter with Redis.

## 4. Outbound Email & OAuth Integrations
- **Outbound SMTP Email Summaries:** The "Monthly Email Performance Summaries" preference is explicitly labeled `SMTP Not Configured` and disabled in the UI unless `SMTP_HOST` is configured.
- **Google sign-in:** Implemented using Google Identity Services and server verification. Requires a Web OAuth client ID and an existing invited account; see `google-login.md`. Without client configuration, the UI clearly leaves Google unavailable and preserves password access. Live Google consent remains unverified.

## 5. Product Deletion Policy
- To preserve historical financial and relational integrity (`ON DELETE RESTRICT` on `sale_items.productId`), products that have appeared in at least one completed `Sale` cannot be hard-deleted via `DELETE /api/products/:id` (`400 Bad Request`). Administrators should set their stock to `0` instead.

## 6. AI Business Assistant Scope & Safety Controls
- **Read-Only by Design:** The AI Business Assistant (`/api/chat`) can only invoke the 12 approved read-only tools in `server/utils/chatTools.js`. It cannot create, edit, or delete products, stock levels, sales, customers, or business settings, nor can it execute raw SQL or arbitrary Prisma queries.
- **External Provider Requirement:** Live natural-language synthesis requires setting `AI_API_KEY` (and optional `AI_MODEL` / `AI_BASE_URL`) in `server/.env`. When `AI_API_KEY` is not set, `/api/chat` returns an explicit `503` configuration notice (`configured: false`) and never fabricates LLM responses.
