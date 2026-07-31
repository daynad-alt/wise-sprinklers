# Wise Demo API — Netlify Functions edition

The same clients / vendors / inventory / invoices API as the Express + SQLite version, packaged as a **single Netlify Function** so it can deploy alongside the website.

Everything under `/api/*` is routed to one serverless function (`netlify/functions/api.js`). A small landing page and the admin dashboard are served from `public/`.

## Database (durable)

This edition stores data in **Netlify Database** — a managed Postgres (Neon) instance. A database has already been provisioned for the `wisesprinklers` project, so Netlify automatically injects `NETLIFY_DATABASE_URL` at build/runtime and the function reads it via `@netlify/neon` — **there are no secrets to configure**.

- The schema is created and seeded **automatically on the first request** (idempotent — safe on every cold start; it never duplicates).
- Data is **durable**: records you add/edit through the API or admin dashboard persist across deploys and cold starts.
- All request/response logic lives in `src/api-core.js` and takes a `db(text, params)` function, so the identical code is exercised by the local Postgres test suite (`pgtest`).

To reset to the seed data, drop the tables in the Netlify DB console (or a fresh branch) — they'll be recreated and reseeded on the next request.

## Admin dashboard

A browser dashboard is served at **`/admin.html`** (linked from the landing page). It reads and writes through the API — KPI cards, and tabs for Clients, Vendors, Inventory, and Invoices with create, delete, stock adjust (±), invoice status changes, and expandable invoice detail with computed totals. It calls the API at the same origin, so open it via `netlify dev` or the deployed site (not `file://`).

## Endpoints

Identical surface to the standalone version, served under `/api`:

- `GET /api/` · `GET /api/summary` · `GET /api/health`
- `GET|POST /api/clients` · `GET|PUT|PATCH|DELETE /api/clients/:id` · `GET /api/clients/:id/invoices`
- `GET|POST /api/vendors` · `GET|PUT|PATCH|DELETE /api/vendors/:id` · `GET /api/vendors/:id/inventory`
- `GET|POST /api/inventory` · `GET /api/inventory/low-stock` · `GET|PUT|PATCH|DELETE /api/inventory/:id` · `POST /api/inventory/:id/adjust`
- `GET|POST /api/invoices` · `GET|PUT|DELETE /api/invoices/:id` · `PATCH /api/invoices/:id/status`

Invoice totals (subtotal, tax, per-line) are computed on read.

## Run locally

```bash
npm install
npm install -g netlify-cli   # if you don't have it
netlify dev                  # serves site + function at http://localhost:8888
```

Then try:

```bash
curl http://localhost:8888/api/summary
curl "http://localhost:8888/api/inventory?low_stock=true"
curl -X POST http://localhost:8888/api/invoices \
  -H "Content-Type: application/json" \
  -d '{"client_id":2,"tax_rate":8.25,"items":[{"inventory_id":1,"description":"PGP rotor","quantity":8,"unit_price":19}]}'
```

## Deploy

This needs the Netlify build step (it bundles the function), so it deploys via the CLI or a connected Git repo — not drag-and-drop.

**Option A — deploy as its own site (CLI):**
```bash
npm install
netlify deploy --prod          # first run links/creates a site
```

**Option B — add it to the existing wisesprinklers site:**
Connect this folder to the `wisesprinklers` Netlify project (via Git, or `netlify link` then `netlify deploy --prod`). Once deployed, the API is available at `https://<your-site>.netlify.app/api/...`.

To keep the marketing site and the API on one domain, put the site's static files in `public/` alongside `index.html`, or configure the redirect so only `/api/*` hits the function (already set in `netlify.toml`).

## Layout

```
wise-backend-netlify/
├── netlify.toml                 # functions dir, esbuild bundler, /api/* redirect
├── package.json                 # @netlify/neon + express + serverless-http
├── public/
│   ├── index.html               # landing page (links to admin)
│   └── admin.html               # admin dashboard (reads/writes /api)
├── src/
│   └── api-core.js              # schema, seed, and all routes (Postgres)
└── netlify/functions/
    └── api.js                   # thin wrapper: Netlify DB (neon) → createApp(db)
```
