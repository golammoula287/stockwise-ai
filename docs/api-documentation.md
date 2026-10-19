# API Documentation

Base URL: `http://localhost:5000/api`  
**Authentication:** All endpoints except `GET /`, `GET /api/health`, and `POST /api/auth/login` require header:  
`Authorization: Bearer <JWT>`  
Missing, malformed, invalid, or expired tokens return `401 Unauthorized`. Admin-only endpoints return `403 Forbidden` for non-admin roles.

---

## 1. Public Health Endpoints
- **`GET /api/health`** → `200 OK` `{ "ok": true, "database": "postgresql", "uptime": 12.3, "timestamp": "..." }`

## 2. Authentication (`/api/auth`)
- **`POST /api/auth/login`** (Rate-limited: max 15 attempts / 15 min per IP)
  - Body: `{ "email": "admin@stockwise.com", "password": "..." }`
  - Returns `200 OK` `{ "token": "<JWT>", "user": { "id", "name", "email", "role", "phone", "businessName" } }`
  - Errors: `400` validation failure, `401` invalid credentials, `429` rate limit exceeded
- **`GET /api/auth/me`** (Protected) → `200 OK` current user profile
- **`POST /api/auth/register`** (Protected, Admin only) → `201 Created` `{ "id", "name", "email", "role" }`

## 3. Products & Inventory (`/api/products` — All Protected)
- **`GET /api/products?search=&category=&status=&lowStockOnly=&sortBy=&page=1&limit=10`** (Protected)
  - Returns `{ "products": [...], "total": 10, "page": 1, "pages": 1 }`
- **`GET /api/products/categories`** (Protected) → Category counts, stock totals, inventory value, low-stock counts
- **`GET /api/products/stock-history?limit=50&productId=&type=`** (Protected) → `StockLog` audit entries (`initial`, `sale`, `restock`, `adjustment`)
- **`GET /api/products/:id`** (Protected) → Single product by UUID
- **`POST /api/products`** (Protected, Admin only) → Creates product with unique `sku` + initial `StockLog`; returns `400` on duplicate SKU or negative price/cost/stock
- **`PUT /api/products/:id`** (Protected, Admin only) → Updates product fields and validates SKU uniqueness; logs stock diff if `stock` changed
- **`PATCH /api/products/:id/stock`** (Protected, Admin only)
  - Body: `{ "delta": 10, "note": "Restock shipment" }` (`delta` must be a non-zero integer)
  - Atomically updates stock in PostgreSQL and writes a normalized `StockLog` entry; returns `400` if resulting stock would be negative (and writes no log on failure)
- **`DELETE /api/products/:id`** (Protected, Admin only) → Deletes product if it has no `SaleItem` history; returns `400` if referenced by existing sales

## 4. Customers (`/api/customers` — All Protected)
- **`GET /api/customers?search=`** (Protected) → List of customers with reconciled `totalSpent` and `totalOrders`
- **`GET /api/customers/:id`** (Protected) → `{ "customer": {...}, "purchaseHistory": [...] }`
- **`POST /api/customers`** (Protected) → `{ "name", "phone", "email?", "address?" }`
- **`PUT /api/customers/:id`** (Protected) → Updates customer details
- **`DELETE /api/customers/:id`** (Protected, Admin only) → Deletes customer record

## 5. Sales (`/api/sales` — All Protected)
- **`GET /api/sales?page=1&limit=15&search=&customer=`** (Protected) → Paginated sales history including `items` (`SaleItem[]`) and persisted tax snapshot (`taxRate`, `taxAmount`, `taxableAmount`, `isLegacyTax`)
- **`GET /api/sales/:id`** (Protected) → Single sale including `items` and persisted tax snapshot
- **`POST /api/sales`** (Protected — PostgreSQL ACID Transaction)
  - Body: `{ "customer"?: "<UUID>", "customerName"?: "...", "customerPhone"?: "...", "items": [{ "product": "<UUID>", "quantity": 2 }], "discount": 0, "taxRate"?: 5, "paymentMethod": "cash" }`
  - Behavior: Consolidates duplicate product UUIDs, verifies integer quantities, `0 <= taxRate <= 100`, and `discount <= subtotal`, atomically deducts stock in PostgreSQL, computes `taxableAmount = subtotal - discount`, `taxAmount = round(taxableAmount * taxRate / 100)`, `total = taxableAmount + taxAmount`, and `profit = taxableAmount - totalCost` using integer minor-unit arithmetic, persists `taxRate` and `taxAmount` on the `Sale` row, increments `Counter` (`INV-XXXX`), updates customer totals, creates `Sale` + `SaleItem` rows, and records `StockLog` entries inside `prisma.$transaction`.
  - Errors: `400` invalid quantity/discount/taxRate/paymentMethod or insufficient stock (rolls back entire transaction), `404` product/customer not found.

## 6. Dashboard (`/api/dashboard` — All Protected)
- **`GET /api/dashboard/stats?dateFilter=This%20Month`** (Protected) → Period-filtered KPI counts, revenue, profit, real period-over-period percentage changes, independent `lowStockCount`/`outOfStockCount`, and preference-aware `notificationsStatus` & `notificationsMessage`
- **`GET /api/dashboard/recent-sales?limit=5&dateFilter=`** (Protected) → Recent transactions
- **`GET /api/dashboard/sales-overview?range=This%20Year`** (Protected) → Actual PostgreSQL sales & profit series (`This Year` 12 monthly buckets or `This Month` 10 3-day buckets)
- **`GET /api/dashboard/notifications`** (Protected)
  - Returns `{ "alertsEnabled": boolean, "status": "disabled" | "empty" | "active", "message": string, "lowStockCount": number, "outOfStockCount": number, "notifications": [...] }`

## 7. AI/ML Insights (`/api/ai/insights` — Protected)
- **`GET /api/ai/insights`** (Protected)
  - Returns:
    - `summary`: Dynamic narrative distinguishing `thresholdAlertCount`, `forecastReorderCount`, and `recommendationState` (`enabled` | `disabled`)
    - `disabledMessage`: Present when `autoReorderEnabled === false` (e.g. `"4 products are below their low-stock thresholds. Automated reorder recommendations are disabled in Preferences."`)
    - `recommendations`: Reorder suggestions with `triggerType` (`threshold` | `forecast`), `forecast14d`, `forecast14dContinuous`, `leadTimeDays` (`7`), `leadTimeDemand`, `safetyStock`, `reorderPoint`, `stockoutProbability` (`1..99`), `suggested`, and `explainability`
    - `topProducts`: Top selling products over trailing 30 days
    - `slowMoving`: In-stock products with zero 30-day velocity and tied-up capital
    - `modelEvaluation`: Walk-forward `maeModel`, `rmseModel`, `maeBaseline` (7-day SMA), `evaluatedProducts`, and `assumptionsAndLimitations`

## 8. Settings (`/api/settings` — All Protected)
- **`GET /api/settings`** (Protected) → Profile, business config, preferences, and SMTP capability status
- **`PUT /api/settings`** (Protected) → Updates profile (with unique email check), business config, and preferences
- **`PUT /api/settings/password`** (Protected) → `{ "currentPassword", "newPassword" }` (verifies current password, hashes new password, and returns a refreshed JWT `token`)
