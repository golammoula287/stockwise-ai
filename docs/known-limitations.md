# Known Limitations & Production Considerations

## 1. AI/ML Forecasting Scope
- **Statistical Time-Series Model:** The forecasting engine (`server/utils/aiInsights.js`) fits **Holt's Double Exponential Smoothing** ($\alpha, \beta$ selected via walk-forward grid search) per product over a 30-day daily demand window and compares out-of-sample Mean Absolute Error (`maeModel`) against a 7-day Simple Moving Average baseline (`maeBaseline`).
- **Cold-Start & Sparse History:** For newly created products with fewer than 7 days of sales history, trend estimates have higher variance and rely more heavily on the configured `lowStockThreshold` safety buffer.
- **Seasonality & External Promotions:** Holt's linear model captures level and linear trend slopes but does not model multi-month holiday seasonality or external marketing campaigns.

## 2. Database & Replica Set Requirement
- **Multi-Document Transactions Require a Replica Set:** MongoDB ACID transactions (`session.withTransaction` in `POST /api/sales`) require a replica-set topology. MongoDB Atlas clusters (including the M0 free tier) provide a 3-node replica set out of the box. If running a local `mongod` instance, start it with `--replSet rs0` or set `USE_IN_MEMORY_DB=true` for local evaluation with `MongoMemoryReplSet`.

## 3. Authentication & Account Provisioning
- **Email/Password JWT Authentication:** The system uses JWT bearer tokens (`Authorization: Bearer <token>`) signed with `JWT_SECRET`.
- **Google OAuth:** Third-party Google OAuth is not configured in this deployment; the login button is explicitly disabled in the UI (`Continue with Google (Unavailable)`) to prevent misleading behavior.
- **Password Reset Delivery:** Self-service email password reset is not wired to an SMTP provider; users are directed to contact the system administrator.

## 4. Product Deletion Policy
- To preserve historical financial and stock-log integrity, products that have appeared in at least one completed `Sale` cannot be hard-deleted via `DELETE /api/products/:id` (`400 Bad Request`). Administrators should set their stock to `0` instead.
