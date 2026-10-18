# StockWise AI — Smart Inventory & Sales Management

> A simple and powerful system to manage products, sales, customers and inventory with smart AI recommendations.

![License](https://img.shields.io/badge/license-MIT-green)
![Stack](https://img.shields.io/badge/stack-MERN-blue)
![Status](https://img.shields.io/badge/status-active-success)

### Live Demo
- Frontend (Vercel): https://stockwise-ai.vercel.app *(add your link after deployment)*
- Backend (Render): https://stockwise-ai.onrender.com *(add your link after deployment)*
- API Health: `GET /api/health`

> **Repository:** https://github.com/meherabmehu/stockwise-ai

---

## Features

### 7 Pages Required
1. **Home (Public)** — Hero with AI Insights, Total Sales / Low Stock / AI Recommendation cards, Features, About, Contact. Responsive nav + CTAs.
2. **Login** — Email/password, Remember me, Forgot password, Continue with Google (placeholder), Contact Admin for new accounts.
3. **Dashboard** — Greeting, 4 stat cards (Total Products, Total Sales, Total Revenue ৳, Low Stock), Sales Overview chart, Recent Sales table with date filter.
4. **Products & Inventory** — CRUD, search, Category/Status filters, tabs (All / Low Stock / Stock History / Categories), stock badges (In Stock / Low Stock / Out of Stock), pagination.
5. **Sales & Customers** — New Sale POS, Sales History, Customers; Add to cart, quantity controls, automatic stock deduction, customer selector, subtotal/discount/total, Complete Sale.
6. **AI Insights** — Business Summary, Stock Recommendations with priority, Top Selling Products, sales trend, slow-moving detection — all computed from **real app data**.
7. **Settings** — Profile / Business / Security / Preferences tabs, avatar, update profile, change password.

### Backend Capabilities
- REST APIs with Express + MongoDB (Mongoose)
- JWT Authentication & Role Authorization (Admin)
- Product CRUD + Inventory management + Category support
- Customer CRUD
- Sales transactions with **automatic stock deduction** (atomic)
- Revenue & profit calculation
- Sales analytics & dashboard aggregation
- Low-stock notifications
- AI recommendations engine (rule-based on real data)
- Business settings persistence
- Input validation (express-validator) + centralized error handling

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + React Router 6 + TailwindCSS + Recharts + Axios |
| Backend | Node.js + Express 4 + Mongoose 7 + JWT + bcryptjs |
| Database | MongoDB (Atlas or local) |
| AI | Rule-based insights engine on live collections (no third-party LLM required for core; optional OpenAI hook) |
| Deployment | Vercel (client) + Render/Railway (server) |

---

## Installation

### Prerequisites
- Node.js 18+
- MongoDB (local `mongod` or Atlas URI)
- Git

### 1) Clone
```bash
git clone https://github.com/meherabmehu/stockwise-ai.git
cd stockwise-ai
```

### 2) Backend Setup
```bash
cd server
npm install
cp .env.example .env
# edit .env with your values
npm run dev   # http://localhost:5000
# seed demo data
npm run seed
```

### 3) Frontend Setup
```bash
cd ../client
npm install
cp .env.example .env
npm run dev   # http://localhost:5173
```

---

## Environment Variables

### server/.env
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/stockwise
JWT_SECRET=change_this_to_a_long_random_string
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
BCRYPT_ROUNDS=10
```

### client/.env
```env
VITE_API_URL=http://localhost:5000/api
```

See `.env.example` in repo root and in each package.

---

## Running

| Command | Description |
|---------|-------------|
| `npm run dev` in `/server` | Start Express with nodemon |
| `npm run start` in `/server` | Production start |
| `npm run dev` in `/client` | Vite dev server |
| `npm run build` in `/client` | Production build |

API base is `/api`. Health check: `GET /api/health → { ok:true }`.

---

## AI Functionality

No hard-coded fake insights. The engine in `server/utils/aiInsights.js` queries live MongoDB:

- **Low-stock recommendations:** `stock <= lowStockThreshold` → reorder suggestion with priority High/Medium
- **Reorder quantity:** `suggested = max( (avgDailySales * 14) - stock, lowStockThreshold)` using last 30-day sales
- **Sales trend:** compare `revenueThisMonth vs revenueLastMonth` → % change and narrative
- **Slow-moving:** products with 0 sales in last 30 days or velocity < 0.2/day
- **Top performers:** aggregation on `Sale.items`
- **Business summary:** combined sentence generated from above metrics

Endpoint: `GET /api/ai/insights`

Known limitations documented in `docs/known-limitations.md`.

---

## Testing

```bash
cd server
npm test
```

Uses Jest + Supertest. Tests cover:
- Auth (valid/invalid login, protected routes)
- Product CRUD + validation
- Sale transaction + stock deduction + insufficient stock error
- Dashboard aggregation
- AI insights shape

Check `server/tests/`.

---

## Project Structure

```
stockwise-ai/
├── client/               # React + Vite frontend (7 pages)
├── server/               # Express + MongoDB backend
├── docs/
│   ├── architecture.md
│   ├── api-documentation.md
│   ├── database-design.md
│   ├── demo-checklist.md
│   └── known-limitations.md
├── .env.example
├── .gitignore
└── README.md
```

---

## Deployment

1. Push `main` to GitHub (see Git Workflow note below).
2. Import `client` to Vercel, set `VITE_API_URL` to your Render URL + `/api`.
3. Deploy `server` to Render: Root Directory `server`, Build `npm install`, Start `npm start`, add env vars.
4. Allow CORS for your Vercel domain.

---

## Security Note

**Never commit `.env` or tokens.** This repo's `.gitignore` blocks them. If a token was ever pasted in an issue/chat, revoke it immediately at GitHub → Settings → Developer settings → PATs and generate a new one. Push via `git credential manager` or `gh auth login`, not by embedding `ghp_...` in URLs.

---

## Author

Meherab — StockWise AI

## License

MIT
