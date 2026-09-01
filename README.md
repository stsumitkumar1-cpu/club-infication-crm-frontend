# Club Infication CRM — Frontend

A role-aware CRM web client for **Club Infication**: it manages members, their
holiday plans, payments, refunds, bookings and the night-by-night entitlement
ledger that ties them together. Built with React 18, TypeScript and Vite, it is
a pure single-page app — every rule it shows is enforced again by the API.

> This repository is the **browser client only**. It needs the Club Infication
> CRM API running to do anything useful (see [Prerequisites](#prerequisites)).

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Project structure](#project-structure)
- [Roles and access](#roles-and-access)
- [Architecture notes](#architecture-notes)
- [Building for production](#building-for-production)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Features

**Dashboard** — role-scoped KPIs (`global` / `team` / `own`): customer counts,
plan value vs. collected vs. pending, refunds, membership expiry warnings,
booking totals, and the aggregate nights allocated / used / returned /
remaining. Managers and Super Admins also get executive-performance figures.

**Customers** — searchable, filterable, paginated list; create, edit and delete
(deletion is refused while a customer still holds memberships, payments,
bookings or refunds); reassignment between executives.

**Customer detail** — one screen per member, covering:

- plan & payment summary, ownership (executive → manager chain)
- memberships (plan purchases) with add / cancel actions
- payment history and refund records
- bookings with check-in / check-out and nights used
- the entitlement ledger — every allocation, use, return, adjustment and
  expiry, with the live remaining balance

**Plans (packages)** — the plan catalogue: price, days, nights, validity in
months, active/inactive toggling, and the number of memberships sold on each.
Everyone reads it; only Super Admin edits it.

**Users** — onboarding and management of Managers and Executives: create, edit,
activate/deactivate, admin password reset, and per-user counts of executives and
customers owned.

**Teams** — team structure by Manager, with assign / unassign of Executives and
a queue of executives not yet on a team.

**Profile** — the signed-in user's own record, their role's real scope, and a
self-service password change with live rule checking.

**Global search** — debounced, keyboard-navigable search across customers,
users and plans from the top bar.

**Authentication** — email/password login, forgot-password and reset-password
flows, JWT access tokens with silent refresh, and an offline state that keeps
you signed in instead of stranding you on a login page that also cannot reach
the server.

---

## Tech stack

| Concern | Choice |
| --- | --- |
| UI | React 18 |
| Language | TypeScript 5 (`strict`) |
| Build / dev server | Vite 5 |
| Routing | React Router 6 |
| Icons | lucide-react |
| Styling | Plain CSS — one stylesheet per page, plus shared tokens |
| State | React context + hooks (no external store) |
| Data fetching | `fetch`, wrapped in a small typed client |

No CSS framework and no state-management library: the app is deliberately close
to the platform.

---

## Prerequisites

- **Node.js 18 or newer** (20 LTS recommended) and npm
- **The Club Infication CRM API**, reachable over HTTP. In development it is
  expected at `http://localhost:3000` and started with `npm run start:dev` from
  the backend repository.

---

## Getting started

```bash
# 1. Clone
git clone https://github.com/stsumitkumar1-cpu/club-infication-crm-frontend.git
cd club-infication-crm-frontend

# 2. Install
npm install

# 3. Configure (see the table below; the defaults work for local dev)
cp .env.example .env

# 4. Run
npm run dev
```

The app is then served at **http://localhost:5173**. Start the backend before
signing in — the login form needs it.

---

## Environment variables

Copy `.env.example` to `.env` and adjust. `.env` is git-ignored.

| Variable | Default | Reaches the browser? | Purpose |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | **Yes** | Where the browser sends API calls. Keep `/api` in development so requests stay same-origin and the dev proxy forwards them — this avoids CORS entirely. In production set the real origin, e.g. `https://api.clubinfication.com/api`. A trailing slash is stripped. |
| `API_PROXY_TARGET` | `http://localhost:3000` | No | Dev-server only: where the `/api` proxy forwards to. Not `VITE_`-prefixed on purpose, so it stays out of the bundle. Only relevant while `VITE_API_BASE_URL` is a same-origin path. |

> ⚠️ **Every `VITE_`-prefixed value is inlined into the JavaScript bundle and is
> therefore public.** Never put a secret, key or password in this file — those
> belong in the backend's own environment, which the browser never sees.

If `VITE_API_BASE_URL` is an absolute URL, no proxy is configured at all: the
browser talks to the API directly, and the API must allow the app's origin via
CORS.

---

## Available scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173, with HMR and the `/api` proxy. |
| `npm run build` | Type-checks the project (`tsc -b`), then builds to `dist/`. The build fails on a type error — that is intentional. |
| `npm run preview` | Serves the built `dist/` locally, for a production-like check. |

---

## Project structure

```
src/
├── api/
│   └── fetchApi.ts            # Typed fetch wrapper: auth headers, token
│                              # refresh, ApiError with status semantics
├── app/
│   ├── providers/
│   │   └── AuthProvider.tsx   # Signed-in identity, roles, logout, refresh
│   └── router/
│       └── ProtectedRoute.tsx # Auth + role gate, and the offline state
├── components/
│   ├── GlobalSearch.tsx       # Debounced cross-entity search
│   ├── Pagination.tsx
│   └── UserMenu.tsx
├── layouts/
│   └── DashboardLayout.tsx    # Sidebar, top bar, <Outlet/>
├── pages/                     # One page + its own stylesheet each
│   ├── LoginPage.tsx          #   login / forgot / reset
│   ├── DashboardPage.tsx
│   ├── CustomersPage.tsx
│   ├── CustomerDetailPage.tsx
│   ├── PackagesPage.tsx
│   ├── UsersPage.tsx
│   ├── TeamsPage.tsx
│   └── ProfilePage.tsx
├── shared/
│   └── password.ts            # Password policy text, mirroring the API's
├── styles/
│   └── shared-ui.css          # Shared UI primitives
├── index.css                  # Design tokens and resets
├── App.tsx                    # Route table
└── main.tsx                   # Entry point
```

### Routes

| Path | Screen | Who can reach it |
| --- | --- | --- |
| `/login` | Login / forgot / reset | Public |
| `/dashboard` | Dashboard | Any signed-in user |
| `/customers` | Customer list | Any signed-in user |
| `/customers/:id` | Customer detail | Any signed-in user |
| `/packages` | Plan catalogue | Any signed-in user (edit: Super Admin) |
| `/profile` | Own profile | Any signed-in user |
| `/users` | User management | Super Admin, Manager |
| `/teams` | Team structure | Super Admin, Manager |

Unknown paths redirect to `/dashboard`.

---

## Roles and access

| Role | Scope |
| --- | --- |
| `SUPER_ADMIN` | Full access to every team, customer and record. |
| `MANAGER` | Their own team: their executives and the customers those executives own. |
| `EXECUTIVE` | The customers assigned to them. |

**Role checks in this app control visibility only.** The API re-checks the role
and the record scope on every request, and it is the authority. Hiding a button
here is a convenience, never a security boundary.

---

## Architecture notes

A few decisions worth knowing before changing things:

**Token handling.** Access token, refresh token and the cached user live in
`localStorage` under `crm_token`, `crm_refresh_token` and `crm_user`. Access
tokens are short-lived by design, so a 401 is routine: `fetchApi` refreshes once
and replays the original request, and only then gives up. Concurrent 401s share
a single in-flight refresh, so a page that fires several calls at once does not
fire several refreshes.

**A dead API is not a dead session.** `ApiError` carries the HTTP status and
distinguishes `isUnreachable` (status 0 or 5xx) from `isAuthFailure` (401/403).
A brief outage therefore shows a "cannot reach the server" screen with a retry
button and keeps the user signed in, instead of logging them out onto a login
page that cannot reach the server either.

**Auth endpoints are exempt from the refresh path.** A 401 from `/auth/login`,
`/auth/refresh`, `/auth/forgot-password` or `/auth/reset-password` is a genuine
answer — a wrong password, a dead reset token — so it must surface as an error
message rather than trigger a redirect that wipes it.

**The dev proxy fails quietly.** When the backend is not listening, the proxy
logs one throttled warning and answers with a JSON 503, rather than printing an
`AggregateError [ECONNREFUSED]` stack for every in-flight request.

**Duplicated policy is deliberate but marked.** The password rules in
[src/shared/password.ts](src/shared/password.ts) and on the profile screen
mirror the API's validator so the hint can be shown before submitting. The
server re-checks every rule, and its message wins if the two ever disagree.

---

## Building for production

```bash
npm run build     # → dist/
npm run preview   # optional: serve dist/ locally
```

Deploying the contents of `dist/` to any static host works, with two
requirements:

1. **SPA fallback.** The app uses `BrowserRouter`, so every unknown path must
   serve `index.html`, or a deep link like `/customers/abc` will 404.
2. **`VITE_API_BASE_URL` must point at the real API at build time.** Vite
   inlines it into the bundle; changing it later means rebuilding.

Nginx example:

```nginx
location / {
  root /var/www/club-infication-crm;
  try_files $uri $uri/ /index.html;
}
```

---

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `[api proxy] backend not reachable at http://localhost:3000` | The API is not running. Start it (`npm run start:dev` in the backend repo), or point `API_PROXY_TARGET` at the right host. |
| "Cannot reach the server" screen with a Retry button | Same cause. The session is still valid — start the API and hit Retry; no need to log in again. |
| Signed out unexpectedly | The refresh token expired or was rejected. Log in again. |
| CORS errors in the console | `VITE_API_BASE_URL` is an absolute URL, so the proxy is bypassed. Either set it back to `/api` for local work, or allow this origin in the API's CORS config. |
| `npm run build` fails with type errors | Intended — the build type-checks first. Fix the reported errors; `strict`, `noUnusedLocals` and `noUnusedParameters` are all on. |
| Blank page after deploying | Missing SPA fallback, or the site is served from a sub-path. See [Building for production](#building-for-production). |

---

## Contributing

- Match the surrounding style: TypeScript `strict`, plain CSS per page, no new
  dependencies without a reason.
- `npm run build` must pass before a PR — it is the type-check gate.
- Comments here explain *why*, not *what*. Keep that habit; a non-obvious
  decision deserves a sentence.
- Never enforce a rule only in the client. If it matters, the API must check it.

---

## License

MIT — see [LICENSE](LICENSE).
