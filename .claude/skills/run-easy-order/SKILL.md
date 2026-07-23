---
name: run-easy-order
description: Launch and drive the Easy Order app (FastAPI backend + Expo frontend + admin-web Next.js portal) on this Windows machine, as a web app or on a phone via Expo Go. Use when asked to run, start, test, or screenshot the Easy Order app.
---

# Run Easy Order

Three independent processes: the FastAPI backend (in-memory data store, no DB),
the Expo frontend (mobile ordering app, used by Operators/Admins), and the
`admin-web` Next.js app (SuperAdmin/Admin-only web portal — client/user
management, statistics). **Start the backend first** — both frontends need it
reachable (the Expo app via the URL baked into `frontend/.env`, admin-web via
`BACKEND_URL` in `admin-web/.env.local`).

The backend now has auth (added for multi-tenant roles: SuperAdmin, Admin,
Operator). `seed_data()` seeds a SuperAdmin and a demo Admin on every startup —
see "Seeded login credentials" below.

## Hardcoded values for this machine

- Backend port: `8000`
- Frontend web port: `8081` (Metro/Expo default)
- admin-web port: `3000` (Next.js default)
- LAN IP: `192.168.8.152` — already set in `frontend/.env` as
  `EXPO_PUBLIC_BACKEND_URL=http://192.168.8.152:8000`. This is required for
  phone/Expo Go mode since a phone can't reach the PC's `localhost`. If the PC's
  IP has changed (different network, DHCP renewal), get the current one with
  `ipconfig | grep -A1 IPv4`, update `frontend/.env` to match, and restart Expo.

## Seeded login credentials

From `backend/server.py`'s `seed_data()`, env-overridable via `backend/.env`
(`SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`, `DEMO_ADMIN_EMAIL`/`DEMO_ADMIN_PASSWORD`);
defaults if unset:

- SuperAdmin (admin-web only — mobile app blocks SuperAdmin login):
  `admin@easyorder.dev` / `ChangeMe123!`
- Demo Admin (admin-web or mobile app, scoped to the seeded "Demo Wholesaler"
  Client): `demo-admin@easyorder.dev` / `ChangeMe123!`
- No Operator is seeded — create one via the Users page in admin-web (or
  `POST /api/users` as the demo Admin, `{"role": "operator", ...}`) to test the
  mobile-only login path.

## Prerequisites (already satisfied on this machine; verify on a fresh clone)

- Python 3.13 with backend deps installed: `pip install -r backend/requirements.txt`
- Node 22 / npm with frontend deps installed: `cd frontend && npm install`
- Node 22 / npm with admin-web deps installed: `cd admin-web && npm install`

## Known bug already patched

`backend/server.py`'s startup handler used to `print("✅ ...")`. That crashes on
Windows with `UnicodeEncodeError` because the default console codepage (cp1252)
can't encode the emoji — the server never finishes starting up. Already fixed
in the repo (plain-ASCII print, no emoji). If this ever regresses, strip
non-ASCII characters from anything printed at startup.

## Start the backend

Use the Bash tool with `run_in_background: true`. Do **not** use `(cmd &)`
shell-backgrounding in Git Bash on Windows — the child process can get reaped
the instant the tool call returns, and it dies silently with no error.

```bash
cd backend && python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

Verify it's actually up (don't just trust the launch):

```bash
curl -s http://localhost:8000/api/
# -> {"message":"Easy Order API"}
curl -s http://localhost:8000/api/products
# -> 3 seeded products: Ulje Bundeve 250ml, Kokosovo ulje 150ml, Jabukovo sirce 1L
```

## Start the frontend — pick one

### Option A: Web (fastest to view/drive, no phone needed)

```bash
cd frontend && npm run web
```

Run with `run_in_background: true`. First bundle takes ~40-60s (1300+ modules).
Poll the task output (`Read` the output file path returned by the tool) until
you see `Web Bundled ...ms node_modules\expo-router\entry.js`, then verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081
# -> 200
```

Open `http://localhost:8081` in a browser.

### Option B: Native app via Expo Go on a phone

```bash
cd frontend && npm start
```

Run with `run_in_background: true`. Wait for the QR code to appear in the task
output, then scan it with the Expo Go app on a phone that's **on the same
Wi-Fi network** as this PC. The app calls the backend at
`http://192.168.8.152:8000` per `frontend/.env` — if it can't connect, either
the phone/PC aren't on the same network, or that IP is stale (see "Hardcoded
values" above).

## Start admin-web (SuperAdmin/Admin web portal)

```bash
cd admin-web && npm run dev
```

Run with `run_in_background: true` (use the Bash tool's actual
`run_in_background` parameter — not a manual `cmd & disown` shell trick, which
can get the child process reaped the moment the tool call returns). Ready in
under a second (`✓ Ready in ...ms`); no long bundle wait like Expo's. Verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
# -> 307 (redirects to /login when signed out) or 200
```

Open `http://localhost:3000` in a browser and log in with one of the seeded
accounts above. `admin-web` talks to the backend via its own server-side
route handlers (`BACKEND_URL` in `admin-web/.env.local`) — the browser never
calls FastAPI directly, so there's nothing LAN-IP-sensitive here even on a
phone/other device, unlike the Expo app.

## Stop

If launched via the Bash tool's `run_in_background`, stop with the `TaskStop`
tool using the task ID returned at launch.

Manual fallback (kills whatever is bound to the port):

```bash
netstat -ano | grep ':8000.*LISTENING'   # note the PID in the last column
taskkill //F //PID <pid>
netstat -ano | grep ':8081.*LISTENING'
taskkill //F //PID <pid>
netstat -ano | grep ':3000.*LISTENING'
taskkill //F //PID <pid>
```

## Gotchas hit while setting this up

- Backend integration tests (`backend/tests/*.py`) default `BASE_URL` to a
  remote `emergentagent.com` preview URL, not localhost. Set
  `EXPO_PUBLIC_BACKEND_URL=http://localhost:8000` before running them or
  they'll silently test the wrong server.
- `expo start` / `npm run web` logs a `TypeError: fetch failed` early on, from
  Expo's doctor trying to reach an online version-check API. This is harmless
  noise as long as bundling continues afterward — only worry if the process
  exits right after it.
- If you edit `backend/server.py` or the frontend and a `curl`/browser check
  still shows old behavior, check whether a *stale* process from an earlier
  session is already bound to that port (`netstat -ano | grep ':<port>'`) —
  `--reload`/Metro fast refresh only help if the process you're actually
  hitting is the one you just edited. `taskkill //F //PID <pid>` it and
  relaunch. This has bitten every one of the three processes at some point.
- The `(cmd & disown)` shell-backgrounding trick in Git Bash is unreliable for
  long-running dev servers on this machine — the child can get silently
  reaped after the doctor-fetch error above with no further log output and
  nothing bound to its port. Always use the Bash tool's own
  `run_in_background: true` on the real command instead.
- `admin-web`'s `JWT_SECRET` (`admin-web/.env.local`) must match the
  backend's `JWT_SECRET` (`backend/.env`) — admin-web verifies the JWT
  locally in Edge middleware (via `jose`) rather than calling the backend for
  every request, so a mismatched secret makes every request look
  unauthenticated even with a valid cookie.
