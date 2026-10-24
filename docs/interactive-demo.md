# Interactive browser demo

When the API reports `DEMO_READ_ONLY=true`, signed-in visitors use a fictional browser-memory workspace. The API still rejects business mutations. The client does not send product, customer, stock, checkout, settings, or due-payment mutations to Neon.

Business data is held in memory per browser tab, seeded independently on each page load. Client navigation preserves edits; refresh or logout resets them. Appearance presets/custom images are the exception: they are stored locally per account/browser and have a reset control.

## Available workflows

- Register from the login page. Registration stores a real staff login on the server; it never grants administrator privileges. Public signup is available only in read-only demo mode, rate-limited, and passwords require 12–72 characters (72 UTF-8 bytes maximum).
- Create/edit/delete products, adjust stock, review the movement ledger. Products already present in sales history cannot be deleted.
- Settings → Business model: default **No dues**, or enable partial payments for saved customers. Collect balances from invoice details. Disabling dues requires collecting outstanding balances first.
- The same settings tab adds optional product fields: text, number, or dropdown, optionally required. Without custom fields the standard form remains. Variants can use separate products/SKUs with independent stock; no automatic variant-combination generator is implemented.
- Checkout derives prices and tax from current sandbox data, checks combined quantities, updates stock/customer totals, and creates a demo invoice. No real payment is processed.
- Sales History supports All time, Month, and inclusive date-range filters in Bangladesh time. CSV downloads every matching page, respects the invoice/customer search, and names the file after the selected period. Invoice details open a cash memo for printing/Save PDF, showing total, paid, and due. Popups must be permitted.
- QR lookup accepts a plain SKU/product ID or JSON containing `sku`, `productId`, or `id`. It reads camera frames or uploaded PNG/JPG/WebP images locally. Camera use requires permission and HTTPS/localhost. Codes select a product for review; they never auto-checkout or open URLs. Only the currently loaded checkout catalog is searched (100 products).
- Settings → Appearance offers background presets and local raster images (2 MB maximum).
- Dashboard aggregates and low-stock suggestions follow the in-memory sales and stock. Browser demand estimates use the trailing 30-day average, explicitly labeled; the server Holt model is unchanged.
- Groq assistant requests use `/api/chat/sandbox`, sending fictional snapshot aggregates. This authenticated, rate-limited route has no database tools, does not modify business data, and labels its data source as `browser_sandbox`. Real provider availability still applies.

Account password changes are intentionally excluded from sandbox simulation; genuine account credentials stay server-managed. Workspace profile edits are simulated and do not change login credentials.

## Verification

- `npm test --prefix client`: 5 sandbox business-rule tests (atomic stock checks, no-due default, partial payment/collections, field validation, reset and aggregate consistency).
- `npm test --prefix server`: 39 mocked tests including forced staff signup, demo gate, hashed passwords and tool-free sandbox assistant.
- Production client build passes.
- Local Chromium flow: dedicated staff login, custom field/product, partial checkout, collection, printable memo, CSV download, QR image decode, refresh reset. Zero product/customer/settings/sales mutations reached the API.
- Camera hardware capture, live Groq sandbox responses, public hosted deployment and hosted CI remain separate checks; not claimed by the mocked/browser verification.

AI Insights provides searchable restock recommendations, selected-period revenue rankings and idle-stock suggestions. Export CSV or Print / PDF downloads the full current report, including methodology; search only filters the onscreen recommendation table. Demo forecasts remain selected-period daily-average estimates and do not claim model validation or calculated stockout probabilities.

Use AI Insights → Analysis period to apply 7/30/90 days, a month or custom dates (up to 366 days). Current periods stop at today in Bangladesh time. Sales measures and forecast inputs follow this selection; stock and restock actions always use current inventory. Exports record the applied period.

Sample data: each fresh browser demo starts with 12 products, 8 fictional customers and 360 fully paid sales across the past 180 days. Multi-item orders, discounts, three payment methods and idle stock demonstrate charts and period filtering. No Neon seeding is required; refresh resets browser changes.

The seed uses relative dates rather than a fixed calendar year. Every fresh session/refresh rebuilds the latest 180 days, so current and previous period charts remain populated in future years. Active sessions keep their changes until refresh/logout. Future-date regression tests include leap-year and Bangladesh-midnight boundaries.
