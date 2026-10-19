# API Documentation

Base URL: `http://localhost:5000/api`  
Protected endpoints require header: `Authorization: Bearer <JWT>`

---

## 1. Health
- **`GET /api/health`** → `200 OK` `{ "ok": true, "uptime": 12.3, "timestamp": "..." }`

## 2. Authentication (`/api/auth`)
- **`POST /api/auth/login`**
  - Body: `{ "email": "admin@stockwise.com", "password": "..." }`
  - Returns `200 OK` `{ "token": "<JWT>", "user": { "id", "name", "email", "role", "phone", "businessName" } }`
  - Errors: `400` validation failure, `401` invalid email or password
- **`GET /api/auth/me`** (Protected) → `200 OK` current user profile
- **`POST /api/auth/register`** (Admin only) → `201 Created` `{ "id", "name", "email", "role" }`

## 3. Products & Inventory (`/api/products`)
- **`GET /api/products?search=&category=&status=&lowStockOnly=&page=1&limit=10`**
  - Returns `{ "products": [...], "total": 10, "page": 1, "pages": 1 }`
- **`GET /api/products/categories`** → Category counts, stock totals, inventory value, low-stock counts
- **`GET /api/products/stock-history?limit=50`** → `StockLog` audit entries (`initial`, `sale`, `restock`, `adjustment`)
- **`POST /api/products`** (Admin) → Creates product + initial `StockLog` (`name`, `category`, `price >= 0`, integer `stock >= 0`)
- **`PUT /api/products/:id`** (Admin) → Updates whitelisted product fields; logs stock diff if `stock` changed
- **`PATCH /api/products/:id/stock`** (Admin)
  - Body: `{ "delta": 10, "note": "Restock shipment" }` (`delta` must be a non-zero integer)
  - Atomically increments/decrements stock and writes a `StockLog` entry; returns `400` if resulting stock would be negative
- **`DELETE /api/products/:id`** (Admin) → Deletes product if it has no sales history; returns `400` if referenced by existing sales

## 4. Customers (`/api/customers`)
- **`GET /api/customers?search=`** → List of customers with `totalSpent` and `totalOrders`
- **`GET /api/customers/:id`** → `{ "customer": {...}, "purchaseHistory": [...] }`
- **`POST /api/customers`** (Protected) → `{ "name", "phone", "email?", "address?" }`
- **`PUT /api/customers/:id`** (Protected) → Updates customer details

## 5. Sales (`/api/sales`)
- **`GET /api/sales?page=1&limit=15&customer=&search=`** → Paginated sales history
- **`GET /api/sales/:id`** → Single sale populated with customer and product details
- **`POST /api/sales`** (Protected — ACID Transaction)
  - Body: `{ "customer"?: "<ObjectId>", "customerName"?: "...", "customerPhone"?: "...", "items": [{ "product": "<ObjectId>", "quantity": 2 }], "discount": 0, "paymentMethod": "cash" }`
  - Behavior: Consolidates duplicate product IDs, verifies integer quantities and `discount <= subtotal`, atomically deducts stock, increments `Counter` for a unique `invoiceNumber` (`INV-XXXX`), updates customer totals, creates `Sale`, and records `StockLog` entries inside `session.withTransaction`.
  - Errors: `400` invalid quantity/discount/paymentMethod or insufficient stock (rolls back entire transaction), `404` product/customer not found.

## 6. Dashboard (`/api/dashboard`)
- **`GET /api/dashboard/stats?dateFilter=`** (Protected) → KPI counts, revenue, profit, percentage changes, and low-stock notifications
- **`GET /api/dashboard/recent-sales?limit=4`** (Protected) → Recent transactions
- **`GET /api/dashboard/sales-overview?range=`** (Protected) → Monthly sales & profit series
- **`GET /api/dashboard/notifications`** (Protected) → Active low-stock and out-of-stock alerts

## 7. AI/ML Insights (`/api/ai/insights`)
- **`GET /api/ai/insights`** (Protected)
  - Returns:
    - `summary`: Dynamic narrative built from live metrics and forecasts
    - `recommendations`: Reorder suggestions with `forecast14d`, `safetyStock`, `stockoutProbability` (`1..99`), `trendSlope`, `priority`, and `explainability`
    - `topProducts`: Top selling products over trailing 30 days
    - `slowMoving`: In-stock products with zero 30-day velocity and tied-up capital
    - `modelEvaluation`: `{ "methodology", "baselineMethod", "horizonDays": 14, "windowDays": 30, "maeModel", "rmseModel", "maeBaseline", "evaluatedProducts" }`

## 8. Settings (`/api/settings`)
- **`GET /api/settings`** (Protected) → Profile, business config, and preferences
- **`PUT /api/settings`** (Protected) → Updates profile, business config, and preferences
- **`PUT /api/settings/password`** (Protected) → `{ "currentPassword", "newPassword" }` (min 6 chars)
