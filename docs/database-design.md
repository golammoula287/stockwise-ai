# Database Design (MongoDB + Mongoose)

## Collections

### 1. users
| Field | Type | Notes |
|-------|------|-------|
| name | String | required |
| email | String | unique, lowercase, index |
| password | String | hashed with bcrypt, select:false |
| role | String | enum: admin, staff (default admin) |
| avatar | String | url optional |

### 2. products
| Field | Type | Notes |
|-------|------|-------|
| name | String | required, index text |
| sku | String | unique |
| category | String | enum: Electronics, Accessories, etc., index |
| price | Number | >=0 |
| cost | Number | for profit calc, >=0 |
| stock | Number | integer >=0 |
| lowStockThreshold | Number | default 5 |
| status | String | virtual: In Stock / Low Stock / Out of Stock computed from stock vs threshold |
| description | String | optional |
| image | String | url optional |
| createdAt | Date |.timestamps |

Indexes: `{ name: "text" }`, `{ category: 1, stock: 1 }`

### 3. customers
| Field | Type | Notes |
|-------|------|-------|
| name | String | required |
| email | String | optional, sparse unique |
| phone | String | required |
| address | String | optional |
| totalSpent | Number | denormalized via sales |
| totalOrders | Number | denormalized |

### 4. sales
| Field | Type | Notes |
|-------|------|-------|
| customer | ObjectId ref Customer | optional (walk-in) |
| items | Array | { product: ObjectId, name, price, quantity, subtotal } |
| subtotal | Number | sum items |
| discount | Number | default 0 |
| total | Number | subtotal - discount |
| paymentMethod | String | cash/card/bkash |
| soldBy | ObjectId ref User | who created |
| createdAt | Date | index for analytics |

Item product is populated but snapshot of name/price kept for history even if product deleted.

### 5. settings
Single-doc per user/business:
| Field | Type |
|-------|------|
| businessName | String |
| currency | String (৳) |
| lowStockThresholdDefault | Number |
| taxRate | Number |

## Relationships
- User 1—N Sale (soldBy)
- Customer 1—N Sale
- Product 1—N Sale.items.product
- Stock deduction is transactional: Sale creation decrements Product.stock atomically via `findOneAndUpdate` with `$inc` and stock >= quantity check (or session if replica set)

## ER Sketch
```
[User] --< [Sale] >-- [Customer]
                 |
                 >-- [Product] (via items)
```

## Validation
- Mongoose required + min checks
- express-validator on routes for 400 with details
