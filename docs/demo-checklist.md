# Demo & Verification Checklist

## 1. Environment & PostgreSQL Setup
- [ ] `server/.env` has `DATABASE_URL="postgresql://USER@HOST:5432/stockwise?schema=public"` and a strong `JWT_SECRET`
- [ ] Run `cd server && npx prisma migrate deploy && npm run seed`
- [ ] Run `cd server && npm test` — all 24 automated PostgreSQL integration and concurrency tests pass
- [ ] Run `cd client && npm run build` — production bundle compiles with zero errors

## 2. Authentication & Security
- [ ] Navigate to `/login` — inputs start empty; Google Sign-In button is clearly marked `Unavailable` and disabled
- [ ] Submitting invalid credentials returns a `401` inline error banner
- [ ] Signing in with valid admin credentials redirects to `/dashboard`

## 3. Dashboard & Analytics
- [ ] 4 KPI cards (`Total Products`, `Total Sales`, `Total Revenue`, `Low Stock Items`) display live PostgreSQL figures
- [ ] `Sales Overview` chart and `Recent Sales` table render cleanly
- [ ] Changing the date range or chart period triggers a fresh API query
- [ ] Clicking the header notification bell displays current low-stock and out-of-stock alerts

## 4. Products & Inventory
- [ ] Search input, Category dropdown, and Status dropdown filter products accurately
- [ ] `Low Stock` tab filters low/out-of-stock products via the backend API
- [ ] `Stock History` tab displays chronological `initial`, `sale`, `restock`, and `adjustment` logs with `previousStock -> newStock`
- [ ] `Categories` tab displays product counts, stock units, and total inventory value per category
- [ ] `±Stock` modal updates stock atomically and rejects negative resulting stock or decimal quantities

## 5. Sales & Customers (PostgreSQL ACID Checkout)
- [ ] `New Sale` starts with an empty cart
- [ ] Adding products, adjusting quantities, and clicking `Complete Sale` creates a unique `INV-XXXX` invoice and deducts product stock atomically in PostgreSQL
- [ ] Attempting to sell more than available stock returns an inline error and rolls back the entire transaction
- [ ] `Customers` tab lists customers with `Orders` and `Total Spent`, and `History` opens the customer's purchase history modal

## 6. AI/ML Insights
- [ ] `AI Business Summary` banner reflects live monthly revenue trend and restock counts
- [ ] `Stock Recommendations` show 14-day Holt forecast units, stockout risk `%`, and priority badge, with working `Restock` button
- [ ] `Demand Analysis` tab displays slow-moving inventory capital and walk-forward `MAE` evaluation (`Holt Model MAE` vs. `7-Day SMA Baseline MAE`)

## 7. Settings
- [ ] `Profile`, `Business`, `Security`, and `Preferences` tabs save changes to PostgreSQL and show inline confirmation banners
