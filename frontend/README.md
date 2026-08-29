# ANPR Traffic Intelligence — Frontend

Production React (Vite) control-room dashboard for the ANPR Traffic Intelligence
Engine. It renders the same views as the zero-build dashboard shipped in
`backend/static/`, but as a proper component tree you can extend.

> **Two frontends, one backend.** The repo ships a self-contained dashboard at
> `backend/static/` (served by FastAPI at `/`, no npm needed — ideal for the
> demo). This `frontend/` is the React scaffold for ongoing development. Both
> speak the identical REST + WebSocket API, so pick whichever suits you.

## Stack

- **React 18** + **Vite 5** (fast dev server, HMR)
- **react-router-dom** — client-side routing (Dashboard / Violations / Search / Reports)
- **react-chartjs-2** + **Chart.js** — report charts
- No global state library; the live WebSocket snapshot flows through a single hook.

## Getting started

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

The dev server proxies `/api` and `/ws` to the FastAPI backend on
`http://localhost:8000` (see `vite.config.js`). Start the backend first:

```bash
cd ../backend
uvicorn api.main:app --reload      # serves API + WS on :8000
```

### Production build

```bash
npm run build          # emits static assets to frontend/dist/
npm run preview        # serve the build locally
```

Deploy `dist/` behind any static host; point it at the same origin as the API
(or add a reverse-proxy rule for `/api` and `/ws`).

## Structure

```
src/
  main.jsx                 app entry (router + toast provider + theme)
  App.jsx                  shell: owns the live WebSocket + violation modal
  services/
    api.js                 typed REST client (matches backend routers exactly)
    format.js              presentation helpers (labels, colours, congestion index)
  hooks/
    useLiveSnapshot.js     WebSocket /ws/vehicles → snapshot + rolling feed
  components/
    Topbar.jsx  Sidebar.jsx  ViolationModal.jsx
    PlateChip.jsx  ToastHost.jsx
  pages/
    Dashboard.jsx  Violations.jsx  Search.jsx  Reports.jsx
  styles/
    theme.css              "Tactical BEL HUD" theme — same tokens and class
                           names as backend/static/styles.css
```

## Writes and the operator key

If the backend runs with `ANPR_API_KEY` set (which `scripts/host-public.ps1`
does automatically for a public tunnel), resolving a violation needs that key in
an `X-API-Key` header. `services/api.js` attaches it from `sessionStorage`, and
the violation modal asks for it after the first 401 — so a shared link works
read-only for everyone and mutably for whoever has the key. `ANPR_READ_ONLY=1`
refuses writes outright and the modal says so instead of failing silently.

## API contract

Every call in `src/services/api.js` maps 1:1 to a backend route:

| UI area      | Endpoint |
|--------------|----------|
| Live map/feed | `WS /ws/vehicles` → `{ vehicles, alerts, congestion, stats }` |
| Cameras       | `GET /api/cameras` |
| Search        | `GET /api/vehicles/{plate}/journey?date=` |
| Violations    | `GET /api/violations/alerts`, `POST /api/violations/{id}/resolve` |
| Reports       | `GET /api/reports/daily-volume`, `/reports/violations-summary`, `/congestion/heatmap` |

Changing a field name on the backend? Update `services/api.js` and
`services/format.js` and the whole UI follows.
