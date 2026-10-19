# Database Design (MongoDB + Mongoose)

## Collections

### 1. `users` (`server/models/User.js`)
| Field | Type | Constraints & Notes |
| :--- | :--- | :--- |
| `name` | String | `required`, trimmed |
| `email` | String | `required`, `unique`, lowercase |
| `password` | String | `required`, `select: false`, hashed via `bcryptjs` pre-save hook |
| `role` | String | `enum: ['admin', 'staff']`, default `'admin'` |
| `phone` | String | Optional contact number |
| `businessName` | String | Optional organization label |

### 2. `products` (`server/models/Product.js`)
| Field | Type | Constraints & Notes |
| :--- | :--- | :--- |
| `name` | String | `required`, text indexed |
| `sku` | String | `unique`, `sparse` |
| `category` | String | `required`, indexed |
| `price` | Number | `required`, `min: 0` |
| `cost` | Number | `min: 0`, default `0` (used for profit calculation) |
| `stock` | Number | `required`, `min: 0`, integer validator (`Number.isInteger`) |
| `lowStockThreshold` | Number | `min: 0`, default `5`, integer validator |
| `status` | Virtual | Computed: `'Out of Stock'` (`0`), `'Low Stock'` (`<= threshold`), `'In Stock'` |

### 3. `customers` (`server/models/Customer.js`)
| Field | Type | Constraints & Notes |
| :--- | :--- | :--- |
| `name` | String | `required`, text indexed |
| `phone` | String | `required`, indexed |
| `email` | String | Optional, lowercase |
| `address` | String | Optional |
| `totalSpent` | Number | Default `0`, incremented atomically inside sale transactions |
| `totalOrders` | Number | Default `0`, incremented atomically inside sale transactions |

### 4. `sales` (`server/models/Sale.js`)
| Field | Type | Constraints & Notes |
| :--- | :--- | :--- |
| `invoiceNumber` | String | `required`, `unique`, indexed (`INV-1001`, ...) |
| `customer` | ObjectId | Ref `Customer` (nullable for walk-in sales) |
| `items` | Array | Non-empty array of `{ product, name, category, price, cost, quantity, subtotal, profit }` |
| `subtotal` | Number | `required`, `min: 0` |
| `discount` | Number | `min: 0`, validated `<= subtotal` |
| `total` | Number | `subtotal - discount` |
| `totalCost` | Number | Sum of item `cost * quantity` |
| `profit` | Number | `total - totalCost` |
| `paymentMethod` | String | `enum: ['cash', 'card', 'bkash', 'other']` |
| `soldBy` | ObjectId | Ref `User` |

### 5. `stocklogs` (`server/models/StockLog.js`)
Audit trail for every inventory change (`initial`, `sale`, `restock`, `adjustment`) recording `product`, `change`, `previousStock`, `newStock`, `note`, and `performedBy`.

### 6. `counters` (`server/models/Counter.js`)
Atomic sequence generator (`_id: 'invoiceNumber'`, `seq: Number`) incremented with `$inc` inside the checkout transaction so concurrent sales never collide on `invoiceNumber`.

### 7. `settings` (`server/models/Setting.js`)
Stores business configuration (`businessName`, `currency`, `taxRate`, `lowStockThresholdDefault`, `preferences`).

---

## ACID Transaction Boundary (`POST /api/sales`)

All writes during a checkout execute inside `session.withTransaction`:
1. Duplicate product IDs in `req.body.items` are consolidated first.
2. Each product's stock is decremented via `Product.findOneAndUpdate({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } }, { new: false, session })`.
3. `Customer` spending and order count are updated with `{ session }`.
4. `Counter` sequence is incremented with `{ session }` to produce a unique `invoiceNumber`.
5. `Sale` and `StockLog` documents are created with `{ session }`.
6. Any validation or stock failure aborts the transaction and rolls back all changes automatically.
