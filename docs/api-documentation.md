# API Documentation

Base URL: `http://localhost:5000/api` (prod: your Render URL + /api)

Auth: `Authorization: Bearer <JWT>` for protected routes.

## Health
- `GET /health` → `{ ok:true, uptime }`

## Auth
- `POST /auth/login` `{ email, password }` → `{ token, user }`
- `GET /auth/me` (protected) → current user
- `POST /auth/register` (admin) → create staff (optional, Contact Admin flow)

## Dashboard
- `GET /dashboard/stats` → `{ totalProducts, totalSales, totalRevenue, lowStockCount, pctChanges }`
- `GET /dashboard/recent-sales?limit=5` → array
- `GET /dashboard/sales-overview?range=This Month` → `[{ month, sales }]`

## Products
- `GET /products?search=&category=All&status=All&page=1&limit=10` → `{ products, total, page }`
- `GET /products/:id`
- `POST /products` (admin) `{ name, category, price, cost, stock, lowStockThreshold }`
- `PUT /products/:id` (admin)
- `DELETE /products/:id` (admin)
- `PATCH /products/:id/stock` `{ delta }` — adjust stock (+/-)

## Customers
- `GET /customers?search=`
- `POST /customers` `{ name, phone, email }`
- `GET /customers/:id` includes purchase history via sales lookup
- `PUT /customers/:id`

## Sales
- `POST /sales` (admin) `{ customer, items:[{ product, quantity }], discount, paymentMethod }`  
  - Validates stock >= quantity for each item
  - Decrements stock atomically
  - Calculates subtotal/total
  - Returns created sale populated
- `GET /sales?limit=&page=&customer=` → paginated
- `GET /sales/:id`

## AI Insights
- `GET /ai/insights` → 
```json
{
  "summary": "Your sales increased by 18% ...",
  "revenueChangePct": 18,
  "topProducts": [{ "name":"Laptop", "sold":34 }],
  "recommendations": [{ "product":"Keyboard", "stock":0, "suggested":50, "priority":"High" }],
  "lowStock": [...],
  "slowMoving": [...]
}
```

## Settings
- `GET /settings`
- `PUT /settings` `{ businessName, currency, taxRate, profile: { name, email, phone } }`
- `PUT /settings/password` `{ currentPassword, newPassword }`

## Errors
All errors: `{ message, errors?:[] }` with status 400/401/403/404/500.
Validation via express-validator returns 400 with details array.

## Example cURL
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stockwise.com","password":"admin123"}'

curl http://localhost:5000/api/products \
  -H "Authorization: Bearer $TOKEN"
```
