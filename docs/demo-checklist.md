# Demo Checklist

Before recording or live demo, verify:

### Setup
- [ ] `server/.env` has correct MONGO_URI and JWT_SECRET
- [ ] `client/.env` VITE_API_URL points to deployed API
- [ ] `npm run seed` executed — demo data present
- [ ] Admin login works: `admin@stockwise.com / admin123`

### Home Page
- [ ] Hero loads: "Manage Your Inventory & Sales Smarter with AI Insights"
- [ ] CTAs: Get Started → /login, Learn More scrolls to Features
- [ ] Feature cards (Easy to Use, AI Powered, Secure, Real-time) visible
- [ ] Responsive: mobile menu works

### Login
- [ ] Valid login redirects to /dashboard
- [ ] Invalid login shows error (not 500)
- [ ] "Remember me" persists
- [ ] Empty fields show validation

### Dashboard
- [ ] Stats cards show real DB counts (150 etc. after seed)
- [ ] Sales Overview chart renders (Recharts)
- [ ] Recent Sales table has 4 rows with dates
- [ ] Date filter works

### Products & Inventory
- [ ] Table shows 5 seeded products with badges (In Stock/Low/Out)
- [ ] Search filters live
- [ ] Category + Status dropdowns filter
- [ ] Add Product modal creates and persists
- [ ] Edit updates, Delete with confirm
- [ ] Low Stock tab shows only low-stock
- [ ] Pagination works when >10 items

### Sales & Customers
- [ ] Add Products → + button adds to cart
- [ ] Cart shows 2 items, quantity +/- updates total
- [ ] Subtotal/Total correct (৳82,500 example)
- [ ] Select Customer dropdown
- [ ] Complete Sale decrements stock (verify in Products after)
- [ ] Insufficient stock shows error
- [ ] Sales History tab lists new sale
- [ ] Add New Customer works

### AI Insights
- [ ] Summary sentence reflects real data (not hardcoded lorem)
- [ ] Stock Recommendations show priority badges
- [ ] Top Selling Products chart/bar correct
- [ ] Slow-moving identified
- [ ] Refresh after new sale changes insights

### Settings
- [ ] Profile tab shows J avatar, name, email, phone
- [ ] Business/Security/Preferences tabs switch
- [ ] Update Profile persists
- [ ] Change Password validates current password
- [ ] Logout redirects to /login

### General
- [ ] All 7 pages navigable via Sidebar
- [ ] Loading spinners visible during fetch
- [ ] Empty states show friendly message
- [ ] Responsive on tablet/mobile (test 768px, 375px)
- [ ] No console errors, no token in logs
