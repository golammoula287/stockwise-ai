# Known Limitations & Production Considerations

## 1. AI/ML Forecasting Scope & Assumptions
- **Statistical Time-Series Pipeline:** The forecasting engine (`server/utils/aiInsights.js`) buckets historical PostgreSQL `SaleItem` quantities into 30 consecutive calendar days (explicitly zero-filling days without sales) and evaluates **Holt's Double Exponential Smoothing** against a **7-day Simple Moving Average (SMA)** baseline over 23 out-of-sample walk-forward steps (`days 8–30`).
- **Sparse & Intermittent Demand Handling:** For products with 1–2 active sales days in the trailing 30 days, the pipeline applies damped trend ($\phi = 0.5$) blended with the empirical 30-day demand rate so single-order spikes cannot extrapolate into unrealistic 14-day forecasts.
- **Stockout Risk Calibration:** Stockout probability $P(D_{14} > \text{stock})$ is computed using a Gaussian CDF with a Poisson variance floor ($\hat{\sigma}_{14} \ge \sqrt{\hat{\mu}_{14}}$). It assumes a 7-day replenishment lead time and does not model multi-month holiday seasonality or external supplier disruptions.

## 2. Database & Migration Management
- **PostgreSQL + Prisma Migrations:** The backend uses PostgreSQL and Prisma ORM (`server/prisma/schema.prisma`). Schema changes must be applied via `npx prisma migrate dev` (development) or `npx prisma migrate deploy` (production/CI) before starting the server.
- **In-Memory Rate Limiter:** Login rate limiting (`server/middleware/rateLimit.js`) uses an in-process memory map suitable for single-instance deployments; horizontally scaled multi-instance deployments should back the rate limiter with Redis.

## 3. Outbound Email & OAuth Integrations
- **Outbound SMTP Email Summaries:** The "Monthly Email Performance Summaries" preference is explicitly labeled `SMTP Not Configured` and disabled in the UI unless `SMTP_HOST` is configured.
- **Google OAuth:** Third-party Google OAuth is not configured in this deployment; the login button is explicitly disabled (`Continue with Google (Unavailable)`).

## 4. Product Deletion Policy
- To preserve historical financial and relational integrity (`ON DELETE RESTRICT` on `sale_items.productId`), products that have appeared in at least one completed `Sale` cannot be hard-deleted via `DELETE /api/products/:id` (`400 Bad Request`). Administrators should set their stock to `0` instead.
