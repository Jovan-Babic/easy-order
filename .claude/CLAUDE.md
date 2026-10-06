# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Easy Order is a multi-tenant B2B wholesale ordering system. A wholesaler ("client"/tenant) has users; its sales reps pick a customer, browse the product catalog, enter quantities/discounts and confirm an order that produces a shareable invoice. Serbian (`sr`) is the default UI language, English (`en`) the alternate.

Three projects live in this repo:
- `backend/` — FastAPI + MongoDB (motor), single file `server.py`, deployed to Vercel as a Python function. Also serves the Android APK and its update metadata.
- `frontend/` — Expo / React Native mobile app (Expo Router). Used by operators and admins; distributed as an APK built with EAS.
- `admin-web/` — Next.js 16 portal for superadmins and admins. Talks to the backend only server-side (route handlers proxy to FastAPI), so the browser never calls the backend directly.

Project docs (Serbian) are in `.claude/DOCS/`: `IZMENE_BEZBEDNOST.md` and `IZMENE_RUNDA_2.md` (what changed and why), `RBAC_PLAN.md` (planned warehouse role), `SETUP_GUIDE.md`. The repo started on the "emergent" platform (`.emergent/`, old "Auto-generated changes" commits); that tooling is no longer used.

## Commands

### Backend (`backend/`)
```powershell
cd backend
pip install -r requirements-dev.txt   # requirements.txt = runtime only (what Vercel installs)
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```
API is under `/api`. Needs `MONGO_URL` and `DB_NAME` (from `backend/.env`). **`backend/.env` points at the real Atlas database** — don't run the test suite against it.

Tests are HTTP integration tests against a running server (they create real `TEST_*` records). Run them against a throwaway Mongo with demo data and no SMTP:
```powershell
$env:SEED_DEMO_DATA = "true"                          # demo client/admin/customers/products
$env:PASSWORD_RESET_DEBUG_TOKEN_IN_RESPONSE = "true"
$env:MONGO_URL = "mongodb://localhost:27017"; $env:DB_NAME = "easy_order_test"
# start uvicorn as above in another terminal, then:
$env:EXPO_PUBLIC_BACKEND_URL = "http://localhost:8000"
pytest tests -v
```
SMTP must NOT be configured for the test server: invites then return `temporary_password` in the response, which the tests rely on (`tests/helpers.py::activate_invited_user`). CI does exactly this (`.github/workflows/backend-tests.yml`, mongo:7 service) on every push touching `backend/`.

### Mobile app (`frontend/`)
```powershell
cd frontend
npm install    # runs scripts/cmd-guard.js --preinstall first (see below)
npm start      # expo start
npm run lint
npx tsc --noEmit
```
Production APKs and OTA updates are published by GitHub Actions workflows, not locally (see "Mobile app distribution" below).
`frontend/.env` needs `EXPO_PUBLIC_BACKEND_URL` (a phone can't reach `localhost` — use the LAN IP). Env vars are only inlined when written literally as `process.env.EXPO_PUBLIC_X`. Typed routes (`.expo/types/router.d.ts`) regenerate on `expo start`; a new screen gives tsc errors until then.

### Admin portal (`admin-web/`)
```powershell
cd admin-web
npm install
npm run dev     # needs BACKEND_URL and JWT_SECRET (same value as the backend)
npx tsc --noEmit
```

## Architecture

### Backend (`backend/server.py`)
- **Tenancy:** `customers`, `products`, `orders`, `users` carry `client_id`. `_scope_query()` / `get_scoped_or_404()` scope reads, `resolve_write_client_id()` scopes writes (superadmin must pass `client_id`). Cross-tenant access returns 404, not 403.
- **Roles:** `superadmin` (global, no client), `admin` (one client), `operator` (sales rep, creates orders), `warehouse` (processes orders; read-only for now). Dependencies: `get_current_user` (default for business routes), `require_roles(...)`, `require_manager` (= superadmin/admin; catalog/customer writes, deleting orders, image upload, user management), `require_order_creator` (superadmin/admin/operator). Admins manage only `ADMIN_MANAGEABLE_ROLES` (operator, warehouse) and edit themselves; assigning another role is 403. Operators see only their own orders (`_order_scope_query`; others 404). `GET /orders` filters: `status` (repeatable), `created_by_user_id`, `from_date`/`to_date`, `limit`/`skip`.
- **Auth:** HS256 JWT with a `tv` (token_version) claim — bumped on password change/reset and role change, which invalidates older tokens. `get_authenticated_user` skips the first-login check and is used only by `/auth/me`, `/auth/logout`, `/auth/change-password`; everything else rejects users with `must_change_password` (403 "Password change required").
- **Accounts are created by invite:** `POST /clients` and `POST /users` generate a temporary password, email it (download link + portal link) and set `must_change_password`. If email fails, the response includes `temporary_password`. No endpoint accepts a creator-chosen password.
- **Passwords:** `ensure_strong_password` (8+ chars, a letter and a digit) — keep the client-side copies in sync (mobile/admin-web change- and reset-password screens).
- **Emails** are stored lowercase with a unique index (`normalize_email`, startup migration).
- **Rate limits** live in Mongo (`auth_attempts`, TTL): 5 failed logins per email per 15 min → 429; 3 forgot-password emails per email per hour (silent).
- **Orders are built server-side:** the client sends only `product_id`, `ordered_qty`, `discount` (must be in `product.discounts` or the default), `additional_discount` (must be in `product.additional_discounts`). The server snapshots name/price/VAT/packaging from the stored product into `OrderItem` — changing a product later never alters past orders. Orders also store `status` (`new → in_progress → shipped`, plus `rejected`/`canceled`; transitions via `POST /orders/{id}/status`, table in `_WAREHOUSE_FLOW`, admin/superadmin override needs a note, conditional update → 409), an embedded `status_history`, `created_by_user_id`, `created_by_name`. Warehouse packs via `PATCH /orders/{id}/items` (`picked_qty`, null = unchecked; first pick takes the order). Responses are `OrderOut` = order + `totals` (by `picked_qty` once shipped) + `ordered_totals` and per-item `line_net`, computed by `calc.py`. Invoice numbers are assigned on the first `shipped` transition (`_assign_invoice_number`): per-client `counters` doc (`invoice:{client_id}`, atomic `$inc`) → `PREFIX/0001`, or typed by the warehouse (`invoice_number` in the status body) when the client's `invoice_numbering` is `manual` (unique per client). The number never changes after the first shipment. While `new`, the creator (or an admin) can edit customer/lines with `PUT /orders/{id}` (re-snapshots prices; 409 once the warehouse took it). On `shipped`/`rejected` the order's creator gets an email (`_send_order_status_email`, best effort, skipped if they did it themselves or SMTP is off). `GET /reports/orders` (manager; counts per status, sales rep and warehouse handler for a date range) feeds the portal `/reports` page. Client invoice settings (`invoice_prefix`, `invoice_numbering`, `invoice_next_seq`, `logo`, `registration_number`, `bank_account`) are edited by the superadmin only; everyone reads their own via `GET /clients/me`. Logo upload: `POST /upload-image?kind=client_logo` (superadmin, folder `easy-order/clients`).
- **Stock (minimal):** `products.stock_qty` (pieces; `null` = untracked) is never written by product PUT (`update_product` excludes it) — only by `POST /stock/receipts`, `POST /stock/adjustments` (counted qty, note required) and shipping. Every change is an append-only `stock_movements` doc (`receipt`/`adjustment`/`shipment`/`reversal`), listed by `GET /stock/movements` (`require_stock_writer` = superadmin/admin/warehouse). Moving an order to `shipped` deducts `picked_qty` (negative stock allowed); leaving `shipped` (admin override) restores it. `GET /products` adds `reserved_qty` (sum of `ordered_qty` in `new`+`in_progress` orders) and `available_qty` = stock − reserved. Portal page `/stock`; mobile catalog shows on hand/available and warns (no block) when the qty exceeds it. Plan: `.claude/DOCS/PLAN_STANJE_MAGACINA.md`.
- **Money math:** `backend/calc.py` is the source of truth. `frontend/src/calc.ts` duplicates it for the unsaved-order preview and the invoice — keep both in sync. admin-web has no copy (uses `totals`/`line_net`).
- **Product images:** `/upload-image` accepts JPEG/PNG/WEBP/HEIC up to 4 MB (Vercel's body limit is 4.5 MB), Cloudinary stores it shrunk (max 1000px, WEBP). Replaced/deleted product images are removed from Cloudinary (`_delete_product_image`), only for URLs in the `easy-order/products` folder. Forms upload the image only on "Save" (a local preview until then); if the product write fails afterwards the client calls `DELETE /upload-image?url=` (manager; own folder only, 409 if a product uses it). `backend/scripts/cleanup_orphan_images.py` removes old orphans (dry run by default, `--apply` to delete).
- **Production guard:** `IS_PRODUCTION` = `APP_ENV=production` or `VERCEL_ENV` production/preview. There, a missing `JWT_SECRET` stops startup, and the default superadmin password is refused. Demo data is seeded only with `SEED_DEMO_DATA=true` and never in production.
- **Mobile app distribution:** `GET /api/app/update` serves `backend/public/app/app-update.json` (`version`, `download_url`, `build_date`, `release_notes`). APKs are GitHub Releases, never committed (`*.apk` is gitignored); `download_url` is the versioned release URL. Releases go through `.github/workflows/release-android.yml` (sets `app.json` version, EAS build, GitHub Release, updates the JSON); JS-only changes through `ota-update.yml` (EAS Update, channel `production`, `runtimeVersion` policy `fingerprint`). Don't bump `app.json` `version` by hand and don't run `eas update` locally (it would inline the local `.env` backend URL). Details: `.claude/DOCS/IZDANJE_APLIKACIJE.md`.

When adding a product field: add it to `Product`, `ProductInput`, `OrderItem` and the snapshot in `create_order`, then to `frontend/src/api.ts` and the catalog → invoice flow.

### Mobile app (`frontend/`)
- `app/_layout.tsx` — `RouteGuard`: unauthenticated → `/login`; `must_change_password` → `/change-password`; the Android APK update prompt (compares `app-update.json` version with `app.json` version); and the OTA restart prompt (`Updates.useUpdates().isUpdatePending`).
- `app/(tabs)/index.tsx` catalog/order (FlatList), `history.tsx`, `warehouse.tsx` (packing tab, warehouse role only), `admin.tsx` (customers/products CRUD, hidden for operators); `invoice.tsx`, `login.tsx`, `change-password.tsx`, `forgot-password.tsx`, `reset-password.tsx`.
- `src/api.ts` — the only place that talks to the backend; throws `ApiError` (`status`, `detail`). 401 → logout handler, 403 "Password change required" → flag the user. Types mirror the backend models.
- `src/context/AuthContext.tsx` — token in SecureStore, `login`/`logout`/`changePassword` (stores the fresh token the backend returns).
- `src/calc.ts` (see money math), `src/invoice.ts` (text/HTML invoice; HTML escapes user content via `escapeHtml`), `src/i18n.ts` (every string in `sr` and `en`), `src/theme.ts` (tokens from `design_guidelines.json` — don't hardcode colors/spacing).
- `src/utils/storage/` — native (`index.ts`) and web (`index.web.ts`) implementations of `StorageBase`; a new method must be declared on `StorageBase` and implemented in both.

### Admin portal (`admin-web/`)
- `proxy.ts` (Next 16's name for middleware) verifies the session cookie (JWT, same secret as the backend) and redirects; operators are refused and warehouse users are limited to the paths in `lib/session.ts` (`isPathAllowed`/`homePath`). In production without `JWT_SECRET` every session is rejected.
- `app/api/**/route.ts` proxy to FastAPI through `lib/backend.ts` (`backendFetch` adds the Bearer token from the httpOnly cookie). `api/auth/login` and `api/auth/change-password` set the cookie.
- `app/(dashboard)/layout.tsx` loads `/auth/me` and redirects to `/change-password?required=1` while `must_change_password` is set.
- `app/(dashboard)/warehouse` (packing queue, status actions, delivery note), `orders` (status/date filters, invoice + delivery note print via `components/OrderPrintModal.tsx`), `clients/[clientId]` (superadmin edits company + invoice settings + logo).
- The App downloads page reads the backend's `/api/app/update` server-side (single source of truth with the mobile update prompt).
- Strings go in `lib/i18n.tsx` (`sr` and `en`).

### Command guard (`frontend/scripts/cmd-guard*`)
`npm install` runs `scripts/cmd-guard.js --preinstall`; it can allow/block/rewrite commands (exit 0/1/2). If an install/dev command fails or gets rewritten unexpectedly, check `scripts/cmd-guard/rules.js` first.

### Testing status
Backend: integration tests in `backend/tests/` (see Commands), run in CI. No frontend or admin-web test suites — verify with `npx tsc --noEmit` and lint.
