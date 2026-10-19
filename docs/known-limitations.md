# Known Limitations & Production Considerations

## 1. AI/ML Forecasting Scope
- **Statistical Time-Series Model:** The forecasting engine (`server/utils/aiInsights.js`) fits **Holt's Double Exponential Smoothing** ($\alpha, \beta$ selected via walk-forward grid search) per product over a 30-day daily demand window queried from PostgreSQL and compares out-of-sample Mean Absolute Error (`maeModel`) against a 7-day Simple Moving Average baseline (`maeBaseline`).
- **Cold-Start & Sparse History:** For newly created products with fewer than 7 days of sales history, trend estimates have higher variance and rely more heavily on the configured `lowStockThreshold` safety buffer.
- **Seasonality & External Promotions:** Holt's linear model captures level and linear trend slopes but does not model multi-month holiday seasonality or external marketing campaigns.

## 2. Database & Migration Management
- **PostgreSQL + Prisma Migrations:** The backend uses PostgreSQL and Prisma ORM (`server/prisma/schema.prisma`). Schema changes must be applied via `npx prisma migrate dev` (development) or `npx prisma migrate deploy` (production/CI) before starting the server.
- **ACID Checkout Concurrency:** `POST /api/sales` executes inside `prisma.$transaction` and locks product rows in deterministic UUID order using conditional `UPDATE "products" SET "stock" = "stock" - qty WHERE "id" = productId AND "stock" >= qty` statements so concurrent checkouts never cause deadlocks or negative stock.

## 3. Authentication & Account Provisioning
- **Email/Password JWT Authentication:** The system uses JWT bearer tokens (`Authorization: Bearer <token>`) signed with `JWT_SECRET`.
- **Google OAuth:** Third-party Google OAuth is not configured in this deployment; the login button is explicitly disabled in the UI (`Continue with Google (Unavailable)`) to prevent misleading behavior.
- **Password Reset Delivery:** Self-service email password reset is not wired to an SMTP provider; users are directed to contact the system administrator.

## 4. Product Deletion Policy
- To preserve historical financial and relational integrity (`ON DELETE RESTRICT` on `sale_items.productId`), products that have appeared in at least one completed `Sale` cannot be hard-deleted via `DELETE /api/products/:id` (`400 Bad Request`). Administrators should set their stock to `0` instead.
