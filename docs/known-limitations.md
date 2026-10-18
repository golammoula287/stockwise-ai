# Known Limitations

## AI Insights
- Rule-based engine, not an LLM. Uses aggregations (avg daily sales, stock thresholds) — useful but not predictive ML. No external LLM call by default; OpenAI integration is an optional hook (`AI_PROVIDER=openai` env) not enabled in demo to avoid cost/keys.
- Slow-moving definition is heuristic (0 sales in 30 days). Seasonal products may be misflagged.
- Reorder suggestion assumes linear demand; does not account for seasonality or promotions.
- Business summary sentence is templated from metrics, not free-form generation.

## Auth
- Single Admin role seeded. "Continue with Google" on Login is UI placeholder (OAuth not wired).
- "Forgot password" triggers toast, no email sending in demo.
- JWT stored in localStorage (convenient for demo) — httpOnly cookies would be more secure in production.

## Inventory
- Stock deduction uses atomic `findOneAndUpdate` with stock check; without Mongo replica set we cannot use multi-doc transactions, so concurrent sales for same product could still race under very high load. For demo traffic this is sufficient.
- Stock History tab shows current snapshot; full audit log (who adjusted when) is stored only as Sale records, not a separate ledger.

## Performance
- Pagination implemented but no server-side text index weighting; search is regex, okay for <10k products.
- Charts use Recharts with mock-friendly data shape; very large datasets should be aggregated monthly on server.

## Deployment
- Seed data is demo; production should not run `npm run seed` twice without clearing.
- No file upload handling for product images — URL field only.

## Testing
- Tests use in-memory Mongo or mocked Mongoose; coverage is core flows, not 100% UI E2E. Playwright E2E is a future improvement.
