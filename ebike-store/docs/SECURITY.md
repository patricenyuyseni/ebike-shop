# Security design and review notes

| Area | What is implemented | Verified by |
|---|---|---|
| Passwords | Argon2id hashes; strength rules; same timing for unknown emails | `test_password_is_hashed_with_argon2`, login tests |
| Sessions | Signed JWT in an **HttpOnly, SameSite=Lax** cookie (`Secure` in production) | `test_session_cookie_is_httponly` |
| CSRF | Double-submit token + `Origin` check on every POST/PUT/PATCH/DELETE (webhooks excluded; they are signed) | `test_csrf_required…`, `test_cross_origin…` |
| Authorisation | Role → permission checks **on the server** for every admin endpoint | `test_admin_endpoints_reject_anonymous_and_customers` |
| Other people's orders | Owner session or secret order token only; otherwise 404 | `test_orders_are_private_to_their_owner` |
| Prices / stock | Always read from the database; browser values ignored; row locks + `CHECK (quantity >= 0)` | checkout tests, **12-buyer race test**, DB constraint test |
| SQL injection | SQLAlchemy parameterised queries; LIKE wildcards escaped; enums validated | `test_sql_injection_and_wildcards_are_harmless` |
| Upload safety | Real image decoding (not file name/type), JPEG/PNG/WebP only, size cap, pixel cap, metadata stripped, ≤10 images | upload tests incl. EXIF test |
| Payments | HMAC-SHA256 signature + 5-minute timestamp window; event-id dedupe (idempotent); amount/currency re-checked; failed event cannot cancel a paid order | payment tests |
| Rate limiting | login, registration, checkout, newsletter | `test_login_rate_limit`, `test_other_rate_limits_apply` |
| CORS | Only `FRONTEND_ORIGIN` | `test_cors_only_allows_our_frontend` |
| Error messages | Generic 500s; validation errors never echo submitted values | `test_unexpected_errors_do_not_leak_details` |
| Secrets | Only in environment variables; `.env` git-ignored; app refuses unsafe production config; `/api/config` has no secrets | config tests |
| Headers | CSP (website), HSTS, nosniff, frame-deny, referrer & permissions policies | `test_spa…`, header test |
| CSV export | Formula-injection protected | `test_csv_export_and_formula_injection_protection` |
| Audit | Admin logins, product/stock/order/payment events stored in `audit_logs` | audit tests |
| Dependencies | `pip-audit`: no known vulnerabilities (after upgrading Pillow/Starlette); `npm audit --omit=dev`: 0 | run Oct 2026 |

## Known limitations (be aware)
* **Rate limiter is in-memory per process**: fine with one worker; with several workers/instances use a shared store (Redis) or the host's/WAF rate limiting.
* **Logout clears the cookie but a stolen token stays valid until it expires** (8 h). A server-side session revocation list is not implemented.
* **No password reset or email verification yet.** A customer who forgets their password cannot recover the account by themselves (to be built; needs working email). An administrator password can be replaced by running `python -m app.cli create-admin --email <that admin's email>` on the server.
* Guest order links contain a secret token; anyone with the link can view that order.
* Personal data (names, phones, addresses, emails) is stored in PostgreSQL in plain form. Use the host's disk encryption and restrict database access. There is no self-service account deletion/data export yet. Add a privacy policy appropriate for your country before launch.
* Refunds, chargeback handling and provider reconciliation are manual.
