# Verification record — 24 October 2026

## Passed locally

- Connected to the configured Neon database; initially no public tables were present. Applied both existing Prisma migrations and populated fictional sample data with `force:false`.
- Login, `/api/health`, DB-backed `/api/ready`, product listing, sales history, dashboard stats, AI Insights and assistant configuration endpoints return 200.
- A real browser checkout created invoice `INV-1010` for one USB Cable. The invoice and stock movement are stored in PostgreSQL. The first attempt hit Prisma's default transaction timeout and rolled back; after raising the timeout, the checkout completed.
- Chromium logged in through the login form, opened inventory, completed checkout, and displayed invoice, forecast and customer views.
- Responsive sweep: dashboard, products, POS, AI Insights and settings at 375, 768 and 1440 pixels. No JavaScript page errors and no document-level horizontal overflow detected. This is not a complete accessibility audit.
- Captured five workflow screenshots plus a read-only demo screenshot in `docs/screenshots/`; recorded an 89-second captioned, silent walkthrough in `docs/media/stockwise-walkthrough.webm`. All use fictional data and avoid login credentials.
- Local `npm test`: 33 mocked safety/provider/Google authentication tests across four suites pass without using Neon.
- Frontend production build passes after React Router 7 upgrade and patched CSS parser override. Frontend npm install audit reports zero vulnerabilities; the earlier backend install audit reported zero.

## Fixes prompted by live verification

- API uses local port 5001 because macOS Control Center occupies 5000; client environment and proxy agree.
- Prisma interactive transactions allow 30 seconds with a 10-second acquisition wait; normal browser requests allow 60 seconds. These limits account for sequential cloud database round trips while preserving transactional rollback.
- Assistant HTTP requests allow 250 seconds for up to four bounded provider calls. A failed provider request still produces a friendly error.
- Chromium also verified dedicated staff login, disabled write controls, logout clearing cached chat/user/token, and handling malformed cached user JSON without page errors.
- Dedicated staff demo login prepared using private environment credentials. `DEMO_READ_ONLY=true` is enabled locally and required for public access; the UI shows a clear read-only sample-data notice. Live staff sign-in succeeds and product/customer/sales/registration/settings writes return 403. Mutation controls are disabled in the UI.

## Provider correction and remaining gates

- Provider correction: user confirmed Groq. Configured `https://api.groq.com/openai/v1` with account-available `openai/gpt-oss-20b`. A live turn executed `get_products_inventory` and returned HTTP 200 with a reply. One earlier turn failed; this is a smoke check, not exhaustive model evaluation. The walkthrough was captured before this correction.
- Full PostgreSQL integration/concurrency suite: intentionally not run against the single demo database. GitHub Actions runs it on a disposable service; the current local changes have not been pushed or executed in hosted CI.
- Public hosting, production URLs/CORS, cold-start behavior, restore exercise and Upwork publication are not complete. `render.yaml` and `docs/deployment.md` prepare the hosting handoff.
- Local automated browser checks do not certify every keyboard interaction, error state, or forecast assumption. Forecasts remain statistical advice based on fictional data, not validated business outcomes.

## Login and hero refresh

- Google identity migration applied additively and Prisma regenerated; password login remains verified.
- Google security checks cover invalid signatures, wrong/expired nonce challenges, unverified email, uninvited accounts, unsafe email linking and role injection. Live Google login requires the user’s Web OAuth client ID.
- Home/login browser sweep at 320/375/640/768/900/1024/1440/1920px: no document overflow or page errors. Staff password login and password visibility toggle pass.
- Shared screenshot gallery rotates automatically, manual selection pauses it, and reduced-motion disables auto-rotation; checked with virtual browser time.

- Browser-mocked Google SDK checks passed: credential/challenge exchange, session redirect, and uninvited-account error. This does not replace a live Google consent check.

## Reference-led photographic landing

- Replaced the software-mockup hero with two generated illustrative retail scenes, overlay navigation, a compact launch bar and a soft white transition. Actual product previews remain in a separate section.
- Slideshow controls, autoplay/pause, reduced-motion handling, navigation and video delivery verified. Seven widths (320–1920px) have no document overflow, browser page errors or failed assets. Images and walkthrough video are served from project-owned public assets.

## Interactive browser demo update — 24 October 2026

The latest user scope replaces read-only UI with a browser-memory sandbox while retaining server-side Neon write protection. See [interactive-demo.md](interactive-demo.md).

- 39 server mocked tests and 5 client sandbox tests passed; client production build passed.
- Chromium full flow passed: staff sign-in, optional custom field/product, no-customer partial-payment rejection, saved-customer partial sale, collection, cash memo popup, CSV download, QR image lookup, refresh reset.
- Dashboard, Products, Sales, AI Insights and Settings: no page errors or horizontal overflow at 375/768/1440px.
- Request tracking observed **zero backend business writes**. Assistant snapshot transport was checked using a mocked provider reply, separately from business mutations.
- Groq snapshot route tests prove no DB tools are supplied/executed. Live Groq response and real camera hardware capture were not tested in this update. Password changes remain excluded from the sandbox.

## Dashboard, memo and responsive corrections

- Selected-month analytics share one pure function across API and browser demo. Four added tests verify Bangladesh month boundaries, previous-month rollover/leap years, dues scope and decimal totals. **9 client tests + 39 server mocked tests pass.**
- Browser checks at 320/375/768/1024/1440/1920px: month switching and prior totals, chart layouts and customer-balance card. Memo totals align; PDF generated and phone width checked.
- Additional checks: short-phone product/customer dialogs, keyboard focus/Escape, drawer resize, assistant/notification panels; full workspace audit at 320–1440px without page errors or horizontal overflow. Product/sales tables scroll internally.
- Latest screenshots: 10-interactive-dashboard.png, 11-cash-memo.png. The memo is a fictional example.

### Revenue chart refinement

The revenue panel defaults to cumulative progress with a daily grouped-bar toggle. Its summary compares only matching available days, explicitly labeled separately from full-month KPI figures. Four added tests cover decimal cumulative totals, future/null dates, unequal months and zero baselines: **13 client tests pass**. Browser checks at 320/375/768/1440px verified view switching, comparison tooltip, empty-month state and no overflow/page errors. Production build passes.

### History search

Sales History searches invoice number, customer name and phone; Stock History searches product name/current SKU. Debounced requests guard against stale responses and have clear/result-count/no-match/error states. Stock returns up to 200 matches; sales displays up to 50 with total count and CSV of loaded matches. Browser checks verified all search types, clear/no-match states and mobile fit. Unit checks: 14 client + 41 mocked server tests passed; no database mutations performed.

Sales period export: 18 client tests pass, including Bangladesh midnight/leap-year dates, invalid ranges, full pagination and sandbox filtering; 41 mocked server tests pass. Chromium verified month CSV download, empty date-range feedback and no overflow at 320/375/768/1440px. Production client build passes.

AI Insights redesign: 21 client tests and production build pass. Added CSV formula/escaping, complete report sections, currency/Bangladesh timestamp, absent validation and sandbox idle-stock checks. Chromium verified CSV contents, landscape PDF generation, recommendation search, refresh, demo restock and responsive widths 320/375/768/1024/1440/1920px, with no page errors. Screenshot: docs/screenshots/13-ai-insights.png.

Insights period/palette refinement: 24 client tests, 41 mocked server tests and build pass. Tests cover Bangladesh dates, leap month, partial/future/oversized periods, sandbox revenue/ranking changes and mocked database period predicates. Chromium checked 7-day, empty historic month, invalid range, full exports, restock and 320–1920px no overflow. No Neon integration tests.

Action confirmations: shared alertdialog explains changes before key inventory, sales/payment, business/settings and password actions. Chromium verified no mutation on Cancel/Escape, successful confirmed restock and sale, parent checkout stays open on Escape, final scroll unlock and business-model cancellation. Responsive 320–1440px checks, 24 client tests and build pass.

Product Sales chart: production build passes. Chromium verified Revenue/Units sold toggle, detailed tooltip, product selector, bar click, historical empty period and responsive widths 320/375/768/1024/1440/1920px with no page errors.

Final visual review: seven workspace routes checked in Chromium at 320/375/768/1024/1440px, home at 320/375/768/1440/1920px, login at 320/375/768/1440px. No horizontal page overflow or uncaught browser errors in workspace/home audit. Five homepage previews recaptured from current fictional demo; all image loads verified. Product chart axis labels kept on one line. 26 client tests and build pass. Homepage capture: docs/screenshots/14-home-current.png.

Centered login + super admin + Vercel prep: production build using VITE_API_URL=/api passes; 26 client and 46 mocked server tests pass. User-management tests verify staff/ordinary-admin denial, safe projections, password hashing, field whitelists, owner protection and historical-record deletion refusal. Requested owner provisioned separately in existing Neon (no business records reseeded/migrated). Chromium verified real owner sign-in/listing and mocked creation/cancel UI; centered login and users page have no overflow at 320/375/768/1440px. No hosted Vercel build/deployment or production smoke test performed.
