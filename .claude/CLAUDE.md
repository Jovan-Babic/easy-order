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
- **Roles:** `superadmin` (global, no client), `admin` (one client), `operator`. Dependencies: `get_current_user` (default for business routes), `require_roles(...)`, `require_manager` (= superadmin/admin; catalog/customer writes, deleting orders, image upload). Admins manage only operators (and edit themselves).
- **Auth:** HS256 JWT with a `tv` (token_version) claim — bumped on password change/reset and role change, which invalidates older tokens. `get_authenticated_user` skips the first-login check and is used only by `/auth/me`, `/auth/logout`, `/auth/change-password`; everything else rejects users with `must_change_password` (403 "Password change required").
- **Accounts are created by invite:** `POST /clients` and `POST /users` generate a temporary password, email it (download link + portal link) and set `must_change_password`. If email fails, the response includes `temporary_password`. No endpoint accepts a creator-chosen password.
- **Passwords:** `ensure_strong_password` (8+ chars, a letter and a digit) — keep the client-side copies in sync (mobile/admin-web change- and reset-password screens).
- **Emails** are stored lowercase with a unique index (`normalize_email`, startup migration).
- **Rate limits** live in Mongo (`auth_attempts`, TTL): 5 failed logins per email per 15 min → 429; 3 forgot-password emails per email per hour (silent).
- **Orders are built server-side:** the client sends only `product_id`, `ordered_qty`, `discount` (must be in `product.discounts` or the default), `additional_discount` (must be in `product.additional_discounts`). The server snapshots name/price/VAT/packaging from the stored product into `OrderItem` — changing a product later never alters past orders. Orders also store `status` (only `new` so far), `created_by_user_id`, `created_by_name`. Responses are `OrderOut` = order + `totals` and per-item `line_net`, computed by `calc.py`.
- **Money math:** `backend/calc.py` is the source of truth. `frontend/src/calc.ts` duplicates it for the unsaved-order preview and the invoice — keep both in sync. admin-web has no copy (uses `totals`/`line_net`).
- **Product images:** `/upload-image` accepts JPEG/PNG/WEBP/HEIC up to 4 MB (Vercel's body limit is 4.5 MB), Cloudinary stores it shrunk (max 1000px, WEBP). Replaced/deleted product images are removed from Cloudinary (`_delete_product_image`), only for URLs in the `easy-order/products` folder.
- **Production guard:** `IS_PRODUCTION` = `APP_ENV=production` or `VERCEL_ENV` production/preview. There, a missing `JWT_SECRET` stops startup, and the default superadmin password is refused. Demo data is seeded only with `SEED_DEMO_DATA=true` and never in production.
- **Mobile app distribution:** `GET /api/app/update` serves `backend/public/app/app-update.json` (`version`, `download_url`, `build_date`, `release_notes`). APKs are GitHub Releases, never committed (`*.apk` is gitignored); `download_url` is the versioned release URL. Releases go through `.github/workflows/release-android.yml` (sets `app.json` version, EAS build, GitHub Release, updates the JSON); JS-only changes through `ota-update.yml` (EAS Update, channel `production`, `runtimeVersion` policy `fingerprint`). Don't bump `app.json` `version` by hand and don't run `eas update` locally (it would inline the local `.env` backend URL). Details: `.claude/DOCS/IZDANJE_APLIKACIJE.md`.

When adding a product field: add it to `Product`, `ProductInput`, `OrderItem` and the snapshot in `create_order`, then to `frontend/src/api.ts` and the catalog → invoice flow.

### Mobile app (`frontend/`)
- `app/_layout.tsx` — `RouteGuard`: unauthenticated → `/login`; `must_change_password` → `/change-password`; the Android APK update prompt (compares `app-update.json` version with `app.json` version); and the OTA restart prompt (`Updates.useUpdates().isUpdatePending`).
- `app/(tabs)/index.tsx` catalog/order (FlatList), `history.tsx`, `admin.tsx` (customers/products CRUD, hidden for operators); `invoice.tsx`, `login.tsx`, `change-password.tsx`, `forgot-password.tsx`, `reset-password.tsx`.
- `src/api.ts` — the only place that talks to the backend; throws `ApiError` (`status`, `detail`). 401 → logout handler, 403 "Password change required" → flag the user. Types mirror the backend models.
- `src/context/AuthContext.tsx` — token in SecureStore, `login`/`logout`/`changePassword` (stores the fresh token the backend returns).
- `src/calc.ts` (see money math), `src/invoice.ts` (text/HTML invoice; HTML escapes user content via `escapeHtml`), `src/i18n.ts` (every string in `sr` and `en`), `src/theme.ts` (tokens from `design_guidelines.json` — don't hardcode colors/spacing).
- `src/utils/storage/` — native (`index.ts`) and web (`index.web.ts`) implementations of `StorageBase`; a new method must be declared on `StorageBase` and implemented in both.

### Admin portal (`admin-web/`)
- `proxy.ts` (Next 16's name for middleware) verifies the session cookie (JWT, same secret as the backend) and redirects; operators are refused. In production without `JWT_SECRET` every session is rejected.
- `app/api/**/route.ts` proxy to FastAPI through `lib/backend.ts` (`backendFetch` adds the Bearer token from the httpOnly cookie). `api/auth/login` and `api/auth/change-password` set the cookie.
- `app/(dashboard)/layout.tsx` loads `/auth/me` and redirects to `/change-password?required=1` while `must_change_password` is set.
- The App downloads page reads the backend's `/api/app/update` server-side (single source of truth with the mobile update prompt).
- Strings go in `lib/i18n.tsx` (`sr` and `en`).

### Command guard (`frontend/scripts/cmd-guard*`)
`npm install` runs `scripts/cmd-guard.js --preinstall`; it can allow/block/rewrite commands (exit 0/1/2). If an install/dev command fails or gets rewritten unexpectedly, check `scripts/cmd-guard/rules.js` first.

### Testing status
Backend: integration tests in `backend/tests/` (see Commands), run in CI. No frontend or admin-web test suites — verify with `npx tsc --noEmit` and lint.
