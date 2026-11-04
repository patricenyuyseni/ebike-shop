# Status checklist (what is real, what is tested, what is missing)

Last full run: backend **89 tests passed**, frontend **23 tests passed**, production build OK, live end-to-end script **26/26 checks passed**, migrations up/down/up OK and `alembic check` clean, `pip-audit` clean, `npm audit --omit=dev` 0 issues.

## ✅ Implemented and tested (on a real PostgreSQL 16)
- Database: 23 tables with foreign keys, indexes, CHECK constraints, Alembic migrations (tested up, down, up; models match migrations)
- Customer registration, login, logout, profile, saved addresses; admin login; roles/permissions enforced on the server
- Product catalogue API: listing, detail, categories, search, filters (category, price, range, motor, frame, stock), sorting, pagination
- Guest and account carts (persisted, merged on login), stock-limited quantities, server-computed totals
- Checkout: server-side prices, shipping, discount codes, configurable tax, order + price/name/SKU **snapshots**, idempotency key, stock reservation under row locks (12 concurrent buyers vs 3 bikes: exactly 3 succeed), expiry of unpaid orders, customer cancel
- Payments **in test mode**: signed webhook verification, replay protection, amount check, failed payment → cancel + restock, success page cannot mark an order paid
- Admin: product create/edit/publish/feature/archive/delete-safely, search/filters, preview; categories (archive/delete); inventory adjustments with history + low-stock alerts; discount codes; review moderation (verified buyers only); orders list/search/filter/detail/status flow/tracking/CSV export; dashboard with real numbers; audit log
- Image upload **validation** (real decoding, type/size/pixel limits, EXIF stripping, primary/reorder/delete), tested with the Cloudinary network call replaced by a stand-in
- Security items in `docs/SECURITY.md` (CSRF, CORS, rate limits, headers, safe errors, injection, access control)
- SEO: per-page titles/descriptions, product JSON-LD, server-injected product meta tags, sitemap, robots.txt, canonical URLs
- Frontend: all requested pages, routing, loading/empty/error states, form validation, responsive Tailwind layouts, keyboard/ARIA basics, code-splitting (first load ≈ 84 KB gzip JS)

## ⚠️ Implemented but NOT tested here (please test on your side)
- **Real Cloudinary upload/delete**: the sandbox cannot reach Cloudinary. The code uses the official SDK; try uploading your first bike and report any error.
- **Real emails** (SMTP): code present; never sent here.
- **Docker image build and a real hosting deployment**: Dockerfile written, never built.
- **Visual design in a real browser**: the pages compile and their logic is tested, but **no browser was available, so nobody has looked at the rendered layouts** (desktop/tablet/mobile). Expect to adjust spacing/colours. No Lighthouse/axe accessibility or performance audit was run.
- **Browser end-to-end test** `frontend/e2e/purchase.spec.ts` (Playwright) is written but was **not run**.
- **HTTPS/secure cookies in production**, real domain, real proxy headers.
- Load/performance testing of the database under traffic.

## 🔑 Needs YOUR credentials / decisions
- Cloudinary account keys
- A **real payment provider** account (Cameroon: Stripe is not available to Cameroon-based merchants; evaluate Flutterwave/CinetPay/Campay etc.) + sandbox keys + webhook secret, and an adapter written for that provider (interface in README)
- SMTP/email provider (optional)
- Hosting + managed PostgreSQL + domain name
- Business decisions: shipping fees/zones, tax rate, brand name/contacts (`VITE_*`), your real product photos and copy, legal pages (terms, privacy policy, returns policy)

## ❌ Not built yet
- Real payment-provider adapter and automated refunds / reconciliation
- Customer password reset and email verification
- Self-service account deletion / personal-data export
- Server-side session revocation; shared (Redis) rate limiting for multi-instance setups
- Admin screens for newsletter subscribers and for editing site text/pages (subscribers are stored in the `newsletter_subscribers` table)
- Shipping-rate rules per region/weight; multiple currencies
- Prerendering for non-product pages (search engines run JavaScript, but static prerendering can rank better)
- Monitoring/alerting setup, automated backup verification

## Verdict
**Not production-ready yet.** It is a working, tested store *in test mode*. Before real customers: connect and test a real payment provider end-to-end in its sandbox, confirm Cloudinary uploads, deploy to staging and click through every page on real phones, review the legal pages, set up backups/monitoring, and complete the "needs your credentials" list.
