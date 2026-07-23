# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Easy Order is a B2B wholesale ordering app: a wholesaler's sales rep picks a customer, browses a product catalog, enters quantities/discounts per product, and confirms an order that generates a shareable invoice (text/HTML, email or copy). Serbian is the default UI language (`sr`), with English (`en`) as an alternate — see `frontend/src/i18n.ts`.

Two independent projects live in this repo:
- `backend/` — FastAPI server, in-memory data store, no persistence across restarts.
- `frontend/` — Expo/React Native app (Expo Router), runs on iOS/Android/web via Expo Go or a dev build.

This project was originally scaffolded/iterated on via the "emergent" platform (see `.emergent/`, `test_result.md`, and the `emergentintegrations` dependency) — auto-commit messages like "Auto-generated changes" come from that tooling, not manual commits.

## Commands

### Backend (`backend/`)
```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```
Runs at `http://localhost:8000`, API mounted under `/api` (e.g. `/api/customers`, `/api/products`, `/api/orders`).

Run backend tests (integration tests over HTTP, not unit tests — **the server must already be running**):
```powershell
cd backend
pytest tests/test_easy_order.py -v
pytest tests/test_iteration3.py -v
pytest tests/test_iteration4.py -v
```
`test_iteration4.py` requires `EXPO_PUBLIC_BACKEND_URL` to be set (it reads `os.environ[...]` directly, no default). The other two test files fall back to a remote `emergentagent.com` preview URL if the env var isn't set — always export `EXPO_PUBLIC_BACKEND_URL=http://localhost:8000` before running tests locally or you'll hit the wrong server:
```powershell
$env:EXPO_PUBLIC_BACKEND_URL = "http://localhost:8000"
```

### Frontend (`frontend/`)
```powershell
cd frontend
npm install    # runs scripts/cmd-guard.js --preinstall first (see below)
npm start      # expo start — scan QR with Expo Go
npm run android
npm run ios
npm run web
npm run lint   # expo lint
```
Uses `yarn@1.22.22` per `packageManager` in `package.json`, though `npm` scripts also work.

Before running the app, set `frontend/.env`:
```
EXPO_PUBLIC_BACKEND_URL=http://YOUR_MACHINE_IP:8000
```
A phone running Expo Go can't reach `localhost` — it needs the dev machine's LAN IP, and both devices must be on the same network. Restart Expo after changing `.env`. Full walkthrough in `SETUP_GUIDE.md`.

## Architecture

### Backend: in-memory only, no MongoDB despite appearances
`backend/server.py` is the entire backend — one file, one `InMemoryDB` object holding `customers`, `products`, `orders` dicts keyed by UUID. **All data is lost on server restart**; `seed_data()` repopulates sample products/customers on every startup. `pymongo`/`motor` are in `requirements.txt` and `backend/.env` defines `MONGO_URL`/`DB_NAME`, but the running server does not use them — don't assume Mongo is actually wired up.

Three resources (`customers`, `products`, `orders`) each follow the same pattern: a `Model` (full object, server-assigned `id`/`created_at`) and an `...Input` model (client payload) sharing the same fields minus `id`. Standard REST CRUD via `api_router` (prefix `/api`), no auth.

Orders **snapshot** product data at order-creation time: `OrderItem` duplicates `name`, `manufacturer`, `price_no_vat`, `vat_rate`, etc. from the `Product` at the moment the order is placed, plus adds `discount`/`ordered_qty`. This is intentional — changing a product later must not alter historical orders/invoices. Keep this in mind when touching product fields: add them to `Product`, `ProductInput`, and `OrderItem` together, and thread them through the frontend catalog → order → invoice flow.

### Frontend: Expo Router, three tabs + one modal-style screen
Routes live in `frontend/app/`:
- `(tabs)/index.tsx` — the catalog/order screen (customer picker, product list, qty/discount inputs, confirm).
- `(tabs)/history.tsx` — past orders.
- `(tabs)/admin.tsx` — CRUD for customers/products.
- `invoice.tsx` — invoice view/share, pushed after order confirmation (`Stack.Screen`, not a tab).

Shared logic lives in `frontend/src/`:
- `api.ts` — the only place that talks to the backend; thin `fetch` wrapper (`req<T>`) plus typed methods (`api.listProducts()`, `api.createOrder()`, ...) and the `Customer`/`Product`/`Order`/`OrderItem` types mirroring the backend Pydantic models. Add new backend fields here too.
- `calc.ts` — pure money math (`lineNet`, `lineVat`, `computeTotals`, `money` formatting via `sr-RS` locale). No side effects — this is the one place discount/VAT arithmetic should live.
- `invoice.ts` — builds invoice text and HTML (for email/print/share) from an `Order`, using `calc.ts` for totals. HTML output manually escapes user content (`escapeHtml`) — do not interpolate raw strings into `buildInvoiceHtml`.
- `i18n.ts` — `translations[lang][key]` dictionary for `sr`/`en`. New user-facing strings need entries in both languages.
- `theme.ts` — colors/spacing/radius/font tokens, sourced from `design_guidelines.json` at the repo root (see below). Don't hardcode colors/spacing in component styles; use these tokens.
- `context/AppContext.tsx` — global `lang`, `t()` translator, and a custom toast (`showToast`), persisted via `storage`.
- `utils/storage/` — a small AsyncStorage/SecureStore wrapper with separate native (`index.ts`) and web (`index.web.ts`) implementations behind a shared `storage-base.ts` abstract class. Adding a method requires declaring it on `StorageBase` first (enforced by the `AssertNoExtras` compile-time check) and implementing it in *both* `index.ts` and `index.web.ts`.

`design_guidelines.json` is the design spec this app was built from (brand colors, spacing rules, glassmorphism do's/don'ts, icon set). `theme.ts` should stay in sync with it; treat it as the source of truth for visual decisions, not just historical reference.

### Command guard (`frontend/scripts/cmd-guard*`)
`npm install` runs `scripts/cmd-guard.js --preinstall`, and shell wrappers can route arbitrary commands through `runArgs` (see `scripts/cmd-guard/`). This is a policy layer that can allow/block/rewrite commands (exit codes: 0 allow, 1 block, 2 rewrite). If a command mysteriously fails or gets rewritten during install/dev scripts, check `scripts/cmd-guard/rules.js` before assuming it's a real error.

### Testing status
There is no frontend test suite. Backend tests (`backend/tests/*.py`) are HTTP integration tests against a running server, not isolated unit tests — they create/read/update/delete real data through the live API (including `TEST_*`-prefixed throwaway records) and expect seed data (`Ulje Bundeve 250ml`, `Maxi Market d.o.o.`, etc. from `seed_data()` in `server.py`) to be present. `test_result.md` at the repo root is a structured log used by the emergent platform's main/testing agent workflow — it has a fixed YAML-in-comments format; don't restructure it.
