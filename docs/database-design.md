# Database Design (PostgreSQL + Prisma ORM)

Schema definition: [`server/prisma/schema.prisma`](../server/prisma/schema.prisma)  
SQL migrations: [`server/prisma/migrations/`](../server/prisma/migrations/)

## Relational Tables

### 1. `users` (`model User`)
| Column | Type | Constraints & Notes |
| :--- | :--- | :--- |
| `id` | `UUID` (`String`) | `@id @default(uuid())` |
| `name` | `TEXT` | `NOT NULL` |
| `email` | `TEXT` | `NOT NULL`, `@unique` |
| `password` | `TEXT` | `NOT NULL`, bcrypt hash |
| `role` | `Role` (`admin` \| `staff`) | `@default(admin)` |
| `phone` | `TEXT` | Nullable contact number |
| `businessName` | `TEXT` | Nullable organization name |
| `createdAt`, `updatedAt` | `TIMESTAMP(3)` | Managed timestamps |

### 2. `products` (`model Product`)
| Column | Type | Constraints & Notes |
| :--- | :--- | :--- |
| `id` | `UUID` (`String`) | `@id @default(uuid())` |
| `name` | `TEXT` | `NOT NULL`, indexed (`@@index([name])`) |
| `sku` | `TEXT` | Nullable, `@unique` |
| `category` | `TEXT` | `NOT NULL`, composite index (`@@index([category, stock])`) |
| `price` | `DOUBLE PRECISION` | `NOT NULL`, validated `>= 0` |
| `cost` | `DOUBLE PRECISION` | `@default(0)` (used for unit profit calculation) |
| `stock` | `INTEGER` | `NOT NULL`, `@default(0)`, non-negative integer |
| `lowStockThreshold` | `INTEGER` | `@default(5)` |
| `status` | Computed (`$extends`) | `'Out of Stock'` (`0`), `'Low Stock'` (`<= lowStockThreshold`), `'In Stock'` |

### 3. `customers` (`model Customer`)
| Column | Type | Constraints & Notes |
| :--- | :--- | :--- |
| `id` | `UUID` (`String`) | `@id @default(uuid())` |
| `name` | `TEXT` | `NOT NULL`, indexed (`@@index([name])`) |
| `phone` | `TEXT` | `NOT NULL`, indexed (`@@index([phone])`) |
| `email` | `TEXT` | Nullable |
| `address` | `TEXT` | Nullable |
| `totalSpent` | `DOUBLE PRECISION` | `@default(0)`, incremented atomically inside sale transactions |
| `totalOrders` | `INTEGER` | `@default(0)`, incremented atomically inside sale transactions |

### 4. `sales` (`model Sale`)
| Column | Type | Constraints & Notes |
| :--- | :--- | :--- |
| `id` | `UUID` (`String`) | `@id @default(uuid())` |
| `invoiceNumber` | `TEXT` | `NOT NULL`, `@unique` (`INV-1001`, ...) |
| `customerId` | `UUID` | Nullable FK → `customers.id` (`ON DELETE SET NULL`), indexed |
| `subtotal` | `DOUBLE PRECISION` | `NOT NULL` |
| `discount` | `DOUBLE PRECISION` | `@default(0)`, validated `<= subtotal` |
| `total` | `DOUBLE PRECISION` | `subtotal - discount` |
| `totalCost` | `DOUBLE PRECISION` | Sum of line item `cost * quantity` |
| `profit` | `DOUBLE PRECISION` | `total - totalCost` |
| `paymentMethod` | `PaymentMethod` | `cash`, `card`, `bkash`, `other` |
| `soldById` | `UUID` | Nullable FK → `users.id` (`ON DELETE SET NULL`) |
| `createdAt` | `TIMESTAMP(3)` | Indexed descending (`@@index([createdAt(sort: Desc)])`) |

### 5. `sale_items` (`model SaleItem`)
| Column | Type | Constraints & Notes |
| :--- | :--- | :--- |
| `id` | `UUID` (`String`) | `@id @default(uuid())` |
| `saleId` | `UUID` | `NOT NULL` FK → `sales.id` (`ON DELETE CASCADE`), indexed |
| `productId` | `UUID` | `NOT NULL` FK → `products.id` (`ON DELETE RESTRICT`), indexed |
| `name` | `TEXT` | Product name snapshot at time of sale |
| `category` | `TEXT` | Category snapshot |
| `price` | `DOUBLE PRECISION` | Unit selling price at time of sale |
| `cost` | `DOUBLE PRECISION` | Unit cost at time of sale |
| `quantity` | `INTEGER` | Positive integer quantity sold |
| `subtotal` | `DOUBLE PRECISION` | `price * quantity` |
| `profit` | `DOUBLE PRECISION` | `(price - cost) * quantity` |

### 6. `stock_logs` (`model StockLog`)
Audit trail for every inventory change (`initial`, `sale`, `restock`, `adjustment`) with foreign keys `productId` → `products.id` (`ON DELETE CASCADE`) and `performedById` → `users.id` (`ON DELETE SET NULL`), recording `change`, `previousStock`, `newStock`, and `note`.

### 7. `counters` (`model Counter`)
Atomic sequence generator (`id: 'invoiceNumber'`, `seq: Int`) updated with `UPDATE "counters" SET "seq" = "seq" + 1 WHERE "id" = 'invoiceNumber' RETURNING "seq"` inside the checkout transaction so concurrent sales never collide on `invoiceNumber`.

### 8. `settings` (`model Setting`)
One-to-one business configuration linked to `users.id` (`userId @unique`) storing `businessName`, `currency`, `taxRate`, `lowStockThresholdDefault`, and `preferences` (`JSONB`).

---

## ACID Transaction Boundary (`POST /api/sales`)

All writes during a checkout execute inside a single PostgreSQL transaction (`prisma.$transaction`):
1. Duplicate product IDs in `req.body.items` are consolidated and sorted deterministically by UUID to prevent row-lock deadlocks.
2. Each product's stock is verified and decremented atomically via `UPDATE "products" SET "stock" = "stock" - qty WHERE "id" = productId AND "stock" >= qty RETURNING *`.
3. `Customer` spending (`totalSpent`) and order count (`totalOrders`) are incremented inside `tx`.
4. `Counter` sequence (`invoiceNumber`) is incremented atomically inside `tx`.
5. `Sale`, nested `SaleItem` rows, and `StockLog` rows are inserted inside `tx`.
6. Any validation or stock failure throws an error, causing PostgreSQL to roll back the entire transaction automatically.
