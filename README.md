# ANPR Traffic Intelligence Engine

City-wide **Automatic Number Plate Recognition** with cross-camera vehicle
trajectory tracking, real-time traffic-violation detection, a live control-room
dashboard, and historical analytics.

> **Smart India Hackathon 2026** · Problem statement by **Bharat Electronics
> Limited** (Transportation & Logistics).

The headline capability is **city-scale re-identification**: the same vehicle,
seen by different cameras minutes apart, is stitched into one continuous journey
using licence-plate matching, vehicle attributes, and spatio-temporal
feasibility — even when the OCR misreads a character or a camera misjudges a
colour.

### Runs anywhere, out of the box

The entire system runs on **simulated multi-camera traffic** with **no GPU, no
cameras, no Docker, and no cloud** — a single `pip install` and one command. A
background simulator drives synthetic vehicles across a five-intersection model
of Nagpur, feeding the exact same pipeline a real deployment would use. Swapping
in real components (YOLO, ByteTrack, EasyOCR, PostgreSQL, Redis) is a matter of
configuration, not rewrites.

---

## Quick start (60 seconds, zero infrastructure)

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn api.main:app --reload
```

> **Note:** use `python -m uvicorn` (not a bare `uvicorn`) — it avoids the
> Windows/PowerShell PATH issue where the `uvicorn` shim isn't found. An
> isolated virtual environment is optional but recommended:
>
> ```bash
> python -m venv .venv
> source .venv/bin/activate         # macOS / Linux
> .venv\Scripts\Activate.ps1        # Windows PowerShell
> ```

Then open:

| URL | What |
|-----|------|
| <http://localhost:8000/> | Live control-room dashboard |
| <http://localhost:8000/docs> | Interactive API docs (Swagger UI) |
| <http://localhost:8000/health> | Health + simulator status |

On startup the app creates the SQLite schema, seeds the five cameras, seeds a
few hours of history so the dashboard and reports have data immediately, and
starts the background traffic simulator. Violations begin appearing in the live
feed within seconds.

That's the whole demo. Everything below is about going deeper or going to
production.

---

## What it does

**Automatic Number Plate Recognition.** Each camera frame runs
detection → OCR → attribute classification. In simulation mode a realistic mock
engine emits plates with occasional single-character OCR errors and ~12 % colour
misreads, so the downstream logic is tested against noisy input — exactly what a
real engine produces.

**Single-camera tracking.** A lightweight IoU + centroid tracker assigns stable
track IDs within a camera, ageing tracks by **wall-clock time** so two different
vehicles occupying the same spot seconds apart never get merged.

**Cross-camera trajectory linking.** The core intelligence. Sightings from
different cameras are associated into one city-wide journey using, in priority
order: exact plate match → near-plate match (≤ 1 edit) → vehicle attributes —
with every candidate gated by a haversine speed check against the road network.
The canonical plate is chosen by a confidence-weighted vote across sightings,
which self-corrects single-character OCR errors.

**Violation detection.** Geometric rules flag red-light running (stop-line
crossing while the signal is red), over-speeding (estimated speed vs. the
camera's posted limit + tolerance, graded by severity), and lane violations.

**Live dashboard + analytics.** A 24/7 dark control-room UI shows a live map with
congestion-coloured camera nodes, real-time stats, and a streaming violation
feed; plus vehicle-journey search, daily-volume / violation-summary / congestion
reports, and CSV/PDF export.

---

## Architecture

```
                        ┌──────────────────────────────────────────────┐
   Simulated cameras    │                  BACKEND (FastAPI)            │
   (or real RTSP)       │                                              │
        │               │   anpr_module    → detect · OCR · attributes │
        ▼               │   tracking_module→ stable per-camera IDs     │
   ┌──────────┐         │   linking_module → cross-camera trajectories │
   │ Traffic  │ frames  │   violations     → red-light / speed / lane  │
   │Simulator ├────────▶│   simulation     → pipeline + background loop│
   └──────────┘         │        │                                     │
                        │        ▼                                     │
                        │   db (SQLAlchemy)      services (live/report/ │
                        │   cache (mem/redis)     violation/export)     │
                        │        │                     │               │
                        │        ▼                     ▼               │
                        │   REST  /api/*          WebSocket /ws/vehicles│
                        └────────┬─────────────────────┬───────────────┘
                                 │                     │  2s snapshots
                    ┌────────────┴─────────┐   ┌───────┴──────────────┐
                    │ static dashboard     │   │ React frontend       │
                    │ (backend/static, no  │   │ (frontend/, Vite)    │
                    │  build step)         │   │                      │
                    └──────────────────────┘   └──────────────────────┘
```

Every stage is written behind a clean interface so the mock implementation can
be replaced by a production one via config alone. See
[`docs/03_ARCHITECTURE_ANPR.md`](docs/03_ARCHITECTURE_ANPR.md) for the full
design.

### Repository layout

```
anpr-traffic-engine/
├── backend/
│   ├── anpr_module/       detection, OCR, attribute classifiers (mock + real interface)
│   ├── tracking_module/   time-aware single-camera tracker (SimpleTracker; ByteTrack stub)
│   ├── linking_module/    cross-camera trajectory linker (the re-ID core)
│   ├── violations/        red-light / over-speed / wrong-lane rules
│   ├── simulation/        fleet, per-frame pipeline, background TrafficSimulator
│   ├── services/          live feed, violation, reporting, CSV/PDF export
│   ├── db/                SQLAlchemy engine, models, repository, seeding
│   ├── cache/             cache abstraction (in-memory | Redis)
│   ├── api/               FastAPI app, routers, Pydantic schemas
│   ├── utils/             config loader, geo (haversine/bearing), plate helpers
│   ├── static/            zero-build control-room dashboard (served at /)
│   ├── config/            cameras.yaml · anpr_config.yaml · sim_config.yaml
│   └── tests/             pytest suite
├── frontend/              React + Vite production dashboard (see frontend/README.md)
├── docs/                  PRD · SRS · Architecture · UI/UX · Dev plan
├── docker-compose.yml     production topology (FastAPI + PostgreSQL + Redis)
└── .env.example           configuration reference
```

---

## Configuration

All deployment-sensitive settings are environment variables (they override the
YAML files). Copy `.env.example` to `.env` to change them; every one has a safe
default, so no `.env` is needed for the demo.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `sqlite:///./anpr_traffic.db` | Any SQLAlchemy URL. Point at PostgreSQL for production. |
| `CACHE_BACKEND` | `memory` | `memory` or `redis`. |
| `REDIS_URL` | `redis://localhost:6379/0` | Used when `CACHE_BACKEND=redis`. |
| `SIM_ENABLED` | `1` | `0` disables the background simulator. |
| `SIM_SEED` | `42` | Deterministic seed — same seed → same traffic & violations. |

Security-related variables (`ANPR_API_KEY`, `ANPR_READ_ONLY`, `ALLOWED_ORIGINS`,
`ALLOWED_HOSTS`, the rate-limit and CSP knobs) are covered in
[Security](#security) below.

The **camera network** lives in [`backend/config/cameras.yaml`](backend/config/cameras.yaml):
five Nagpur intersections (Sitabuldi, Dhantoli, Nagpur Square, Ajni, Sadar) with
coordinates, stop-line calibration, speed limits, lane geometry, and the road-
network edges the linker uses. Add a camera by adding an entry and an edge — no
code changes. ANPR noise levels and simulator behaviour are in
`anpr_config.yaml` and `sim_config.yaml`.

---

## API reference

Interactive docs at `/docs`. Summary:

| Method | Path | Description |
|--------|------|-------------|
| `WS` | `/ws/vehicles` | Live snapshot every 2 s: `{ vehicles, alerts, congestion, stats }` |
| `GET` | `/api/cameras` | Camera list with positions & calibration |
| `GET` | `/api/vehicles/live` | Current live vehicles |
| `GET` | `/api/vehicles/search` | Historical detection search (plate/type/colour/camera/time) |
| `GET` | `/api/vehicles/{plate}/journey` | Reconstructed cross-camera journey for a plate |
| `GET` | `/api/violations/alerts` | Recent violations (filter by type/severity/status) |
| `GET` | `/api/violations/summary` | Aggregated violation summary |
| `POST` | `/api/violations/{id}/resolve` | Mark a violation resolved (with notes) |
| `GET` | `/api/violations/export.csv` · `.pdf` | Export violations (PDF needs `reportlab`) |
| `GET` | `/api/congestion/heatmap` | Per-camera congestion levels |
| `GET` | `/api/reports/daily-volume` · `.csv` | Vehicle volume by hour and camera |
| `GET` | `/api/reports/violations-summary` | Violation breakdown by type/severity/camera |
| `GET` | `/api/stats` | Live engine statistics |

---

## Frontends

Two interchangeable UIs speak the identical API:

1. **Zero-build dashboard** — `backend/static/`, served by FastAPI at `/`. No
   npm, no build; ideal for the demo. Leaflet + Chart.js from CDN.
2. **React (Vite) app** — `frontend/`, the production development path. See
   [`frontend/README.md`](frontend/README.md).

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxies API + WS to :8000)
```

---

## Share a public link

To let someone open the dashboard from their own device — a remote reviewer, a
jury member, a teammate — publish the local server through a
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).
No port forwarding, no router changes, no TLS certificate, and WebSockets are
proxied for you so the live feed keeps streaming.

Install the tunnel client once:

```powershell
winget install --id Cloudflare.cloudflared
```

Then start everything with one command from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\host-public.ps1
```

The script starts the backend, waits for `/health` to answer, opens the tunnel,
and prints a public URL of the form `https://<random-name>.trycloudflare.com`.
Open it anywhere. Press `Ctrl+C` once to stop both processes.

To serve on your local wifi instead of the public internet — faster, and it
works with no internet at all — use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\host-public.ps1 -LocalOnly
```

That binds to `0.0.0.0` and prints the `http://192.168.x.x:8000` addresses other
devices on the same network can reach.

### Before you demo on someone else's network

The dashboard pulls Leaflet and Chart.js from a CDN. Conference and campus
networks sometimes block those, which leaves the map blank. Bundle them locally
once, while you still have internet:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\vendor-assets.ps1
```

This writes the libraries into `backend/static/vendor/`, which the dashboard
prefers over the CDN — so the demo then renders with zero external requests.

### Two things to know about hosting this

**Run exactly one worker.** The `TrafficSimulator` is an in-process singleton.
A second worker or a second instance runs a second simulation against the same
database, doubling every detection and violation. Never add `--workers 2`, and
don't let a platform autoscale it. `host-public.ps1` pins `--workers 1`.

**The script hardens the deployment before it exposes it.** A tunnel URL is
genuinely public, so `host-public.ps1` generates a random write key, prints it,
and hides `/docs`. Visitors can watch the live dashboard; only someone holding
the key can resolve a violation — the dashboard prompts for it once and keeps it
in `sessionStorage` for the tab. Useful flags:

```powershell
# read-only link: nothing can be mutated, whatever key is presented
powershell -ExecutionPolicy Bypass -File scripts\host-public.ps1 -ReadOnly

# reuse a key you already have, e.g. one shared with a co-presenter
powershell -ExecutionPolicy Bypass -File scripts\host-public.ps1 -ApiKey 'my-key'

# LAN demo on a trusted network, no key at all
powershell -ExecutionPolicy Bypass -File scripts\host-public.ps1 -LocalOnly -OpenWrites
```

---

## Security

Two deployment shapes have to be safe at once: a local demo on a trusted
machine, where zero configuration must still work, and a public tunnel, where
the same process is reachable by anyone. So everything that can be hardened
without a decision is on unconditionally, and the one control that needs a
decision — who may change data — is opt-in.

**On by default, no configuration:**

- Response headers on every reply: `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
  and HSTS once the request arrives over TLS.
- A content-security policy with `frame-ancestors 'none'`, `object-src 'none'`
  and **no `unsafe-inline` in `script-src`** — so an injected `<script>` cannot
  run even if something slipped past output encoding. (`style-src` does allow
  inline styles: Leaflet and Chart.js write `element.style` directly.)
- `Cache-Control: no-store` on `/api` and `/health`. Plate-to-location data has
  no business in a shared cache or browser history.
- Per-IP rate limits over a sliding minute: 240 requests for ordinary reads, 30
  for exports and report aggregations, which are the endpoints that materialise
  large result sets.
- WebSocket origin checking. WebSockets are exempt from CORS, so without this
  any website could open `/ws/vehicles` in a visitor's browser and read the live
  feed. A missing `Origin` (curl, a Python client) is allowed; a foreign one is
  closed with policy code 1008. Concurrent sockets are capped at 64.
- Bounded inputs: plates, colours, types and camera ids are pattern-validated,
  `offset` is capped at 10 000 (a deep offset on SQLite is a free full scan),
  resolution notes at 500 characters, CSV exports at 5 000 rows, analytics
  queries at 500 000.
- LIKE metacharacters are escaped in plate search, so a bare `%` cannot turn one
  lookup into a full-table dump.
- CSV exports neutralise spreadsheet formulas. Plate text arrives from OCR, so a
  cell can legitimately begin with `=` or `@` — and Excel would then execute it
  when an operator opens the report, turning a read-only export into code on
  their machine. Such cells are written as text; numbers stay numbers.
- A CORS allowlist rather than a wildcard, and asking for `*` explicitly forces
  credentials off — `*` plus credentials makes Starlette reflect whatever
  `Origin` arrived, which is "any site, with cookies".
- The container image runs as an unprivileged user, and `.dockerignore` keeps the
  local virtualenv, the SQLite database (real plate history) and any `.env` out
  of the build context.

**Set these before exposing the API on a network you don't control:**

| Variable | Effect |
|----------|--------|
| `ANPR_API_KEY` | Mutating endpoints require this in `X-API-Key` (or `Authorization: Bearer`). Compared with `secrets.compare_digest`. `host-public.ps1` sets it automatically. |
| `ANPR_READ_ONLY=1` | Refuse every mutation regardless of credentials — the safest way to publish a link. |
| `ALLOWED_ORIGINS` | Cross-origin allowlist, e.g. `https://ops.example.gov`. |
| `ALLOWED_HOSTS` | `Host` header allowlist. Unset disables the check, which is what LAN and tunnel demos need. |
| `ENABLE_DOCS=0` | Hide `/docs`, `/redoc` and `/openapi.json` so the schema doesn't advertise the write endpoint. |

Generate a key with:

```bash
python -c "import secrets;print(secrets.token_urlsafe(24))"
```

`GET /health` reports the posture (`write_protected`, `read_only`) so the
dashboard knows whether to ask for a key before attempting a write. The full
variable list, including the rate-limit and CSP knobs, is in
[`.env.example`](.env.example); the behaviour is asserted in
[`backend/tests/test_security.py`](backend/tests/test_security.py).

**Known limitations, stated plainly.** There is no user accounting — one shared
key, no per-operator identity or audit trail, which a real deployment behind BEL
infrastructure would need. Rate-limit state is per-process and in-memory, so it
resets on restart and would need Redis across multiple instances. `docker
compose` requires `POSTGRES_PASSWORD` and `REDIS_PASSWORD` to be set and does
not publish the database or cache ports.

---

## Production path (Docker Compose)

The same code, wired to PostgreSQL + Redis instead of SQLite + in-memory cache:

```bash
docker compose up --build
# dashboard → http://localhost:8000/   ·   API docs → http://localhost:8000/docs
```

Compose sets `DATABASE_URL`, `CACHE_BACKEND=redis`, and `REDIS_URL` for you.
Because the backend runs an in-process background simulator, it uses a **single
Uvicorn worker** by design. See [`docker-compose.yml`](docker-compose.yml).

### Going to real cameras / real ML

The mock ANPR engine, in-memory cache, and SQLite are swap-in points, not
rewrites:

| Simulated (default) | Production swap |
|---------------------|-----------------|
| Mock detector / OCR / attributes | YOLOv8 + EasyOCR (implement the `anpr_module` interfaces) |
| `SimpleTracker` (IoU/centroid) | ByteTrack (stub present in `tracking_module`) |
| SQLite | PostgreSQL (`DATABASE_URL`) |
| In-memory cache | Redis (`CACHE_BACKEND=redis`) |
| `TrafficSimulator` frames | RTSP camera ingestion |

---

## Testing

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest
```

The suite covers the AI core (tracking stability, cross-camera re-identification
with OCR self-correction, violation rules) and the API surface.

---

## Documentation

Full planning artefacts are in [`docs/`](docs/): Product Requirements
([`01_PRD`](docs/01_PRD_ANPR.md)), Software Requirements
([`02_SRS`](docs/02_SRS_ANPR.md)), Architecture
([`03_ARCHITECTURE`](docs/03_ARCHITECTURE_ANPR.md)), UI/UX
([`04_UIUX`](docs/04_UIUX_ANPR.md)), and the Development Plan
([`05_DEV_PLAN`](docs/05_DEV_PLAN_ANPR.md)).

## License

Prepared for Smart India Hackathon 2026. See the problem statement by Bharat
Electronics Limited for usage terms.
