# Database Design (PostgreSQL + Prisma)

Schema path: `server/prisma/schema.prisma`  
Migrations:
- `20261019034359_init` — Initial 8-table PostgreSQL relational schema
- `20261019090000_add_sale_tax_snapshot` — Safe additive migration adding nullable `taxRate` and `taxAmount` columns to `sales`

---

## Core Relational Tables

1. **`users` (`User`):** `id` (UUID PK), `name`, `email` (`@unique`), `password` (bcrypt hash), `role` (`admin` | `staff`), `phone`, `businessName`.
2. **`products` (`Product`):** `id` (UUID PK), `name`, `sku` (`@unique`), `category`, `price`, `cost`, `stock` (Int), `lowStockThreshold` (Int, default `5`), `description`.
3. **`customers` (`Customer`):** `id` (UUID PK), `name`, `email`, `phone`, `address`, `totalSpent`, `totalOrders`.
4. **`sales` (`Sale`):**
   - `id` (UUID PK), `invoiceNumber` (`@unique`), `customerId` (FK → `customers.id`, `ON DELETE SET NULL`), `customerName`, `customerPhone`, `customerEmail`
   - `subtotal` (`Float`), `discount` (`Float`), `taxRate` (`Float?` — persisted checkout tax rate percentage), `taxAmount` (`Float?` — persisted checkout tax amount), `total` (`Float`), `totalCost` (`Float`), `profit` (`Float` — revenue excluding collected tax minus cost and discount)
   - `paymentMethod` (`cash` | `card` | `bkash` | `other`), `soldById` (FK → `users.id`), `createdAt`.
5. **`sale_items` (`SaleItem`):** `id` (UUID PK), `saleId` (FK → `sales.id`, `ON DELETE CASCADE`), `productId` (FK → `products.id`, `ON DELETE RESTRICT`), `name`, `category`, `price`, `cost`, `quantity` (Int), `subtotal`, `profit`.
6. **`stock_logs` (`StockLog`):** `id` (UUID PK), `productId` (FK → `products.id`, `ON DELETE CASCADE`), `productName`, `category`, `type` (`initial` | `sale` | `restock` | `adjustment`), `change` (Int), `previousStock` (Int), `newStock` (Int), `note`, `performedById` (FK → `users.id`).
7. **`settings` (`Setting`):** `id` (UUID PK), `userId` (`@unique`, FK → `users.id`), `businessName`, `currency`, `taxRate`, `lowStockThresholdDefault`, `businessEmail`, `businessPhone`, `businessAddress`, `preferences` (`Json`).
8. **`counters` (`Counter`):** `id` (`'invoiceNumber'`), `seq` (Int) — atomic sequence counter for concurrency-safe invoice generation.

---

## Historical Invoice Tax Integrity

- **New Sales (`POST /api/sales`):** Capture and persist the exact `taxRate` and `taxAmount` applied at checkout time. Subsequent changes to `Setting.taxRate` in Business Settings never alter previously recorded invoices.
- **Pre-Migration Legacy Sales:** Invoices created prior to migration `20261019090000_add_sale_tax_snapshot` retain `taxRate = NULL` and `taxAmount = NULL` (`isLegacyTax = true`) so historical financial records are never overwritten with guessed values.
