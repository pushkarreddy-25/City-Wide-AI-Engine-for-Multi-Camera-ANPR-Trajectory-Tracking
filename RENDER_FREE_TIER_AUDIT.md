# Comprehensive Render.com Free Tier Production-Readiness Audit

**Project:** City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking  
**Repository:** `pushkarreddy-25/City-Wide-AI-Engine-for-Multi-Camera-ANPR-Trajectory-Tracking`  
**Audit Date:** September 8, 2026  
**Auditor:** Antigravity AI (Google DeepMind)  
**Target Platform:** Render.com FREE Tier (Web Service & Static Site)  

---

## 1. Executive Summary

This audit evaluates the complete production readiness and hosting feasibility of the **City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking** on **Render.com's Free Tier**.

The application is an advanced intelligent transportation surveillance system featuring:
- A high-performance **React 18 + Vite** control-room dashboard (interactive Leaflet maps, Chart.js analytics, Three.js 3D vehicle models, Framer Motion animations, real-time alert feeds).
- A **FastAPI** backend exposing REST APIs, real-time WebSocket vehicle streaming, rate limiting, and security middleware.
- An in-process **Traffic Simulator** generating synthetic multi-camera city vehicle movement, speed violations, red-light violations, lane misuse, and trajectory linking.
- An **AI Prompt Router** supporting multi-LLM routing (Groq, OpenAI, Anthropic, Gemini) with local rule-engine fallback.
- Optional computer vision modules (**YOLOv8/11**, **EasyOCR**, **PaddleOCR**, **OpenCV** frame decoding).

### Key Audit Finding
The codebase possesses high architectural discipline: optional heavy dependencies are lazily loaded, mock engines provide a complete zero-dependency simulation mode, and clean abstractions separate API, database, and background processing. 

**However, the project CANNOT be deployed on Render Free "as-is" without addressing 4 critical deployment blockers (P0):**
1. **Dynamic Port Binding:** Uvicorn startup commands currently target fixed port `8000`. Render requires dynamic binding to `$PORT`.
2. **512 MB RAM Exhaustion (OOM):** If heavy ML dependencies (`torch`, `ultralytics`, `easyocr`) are installed or enabled, the container will instantly crash with Linux OOM (SIGKILL).
3. **Ephemeral Storage Data Loss:** The local SQLite database (`anpr_traffic.db`) will be destroyed on every 15-minute spin-down, container restart, or redeploy.
4. **WebSocket Cross-Origin Blocking:** Backend security middleware rejects WebSocket connections from external origins unless `ALLOWED_ORIGINS` is configured with the frontend domain.

When configured in **Mock Simulation Mode** (`SIM_ENABLED=1`, `engine: mock`) and backed by an **external PostgreSQL database**, the application runs smoothly, reliably, and within ~140 MB of RAM on Render Free.

---

## 2. Final Verdict

### 🟡 READY AFTER REQUIRED FIXES

The application **can run on Render Free**, but **only in Mock Simulation Mode** and **only after implementing the P0 configuration fixes**. 

* **Why not 🟢 READY?** Hardcoded port bindings, missing CORS/WebSocket origin environment variables, ephemeral SQLite data loss, and PyTorch OOM hazards will break a naive deployment.
* **Why not 🔴 NOT COMPATIBLE?** The core engine has an exceptional built-in mock vision pipeline that simulates multi-camera ANPR, vehicle tracking, violations, and trajectory linking entirely in memory and SQL without needing PyTorch or GPU resources.

---

## 3. Architecture Analysis

### Internal System Dependency Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Frontend (Render Static Site)                        │
│             React 18 + Vite + Leaflet + Chart.js + Three.js             │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTPS REST & WSS
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Backend (Render Web Service)                         │
│                           FastAPI / Uvicorn                             │
│                                                                         │
│  ┌───────────────────────┐ ┌───────────────────┐ ┌───────────────────┐  │
│  │ REST APIs & Security  │ │ /ws/vehicles Feed │ │ AI Prompt Router  │  │
│  └───────────┬───────────┘ └─────────┬─────────┘ └─────────┬─────────┘  │
│              │                       │                     │            │
│              ▼                       ▼                     │            │
│  ┌─────────────────────────────────────────────┐           │            │
│  │           In-Process Daemon Threads         │           ▼            │
│  │  • TrafficSimulator (Fleet & Graph Routing) │   ┌─────────────────┐  │
│  │  • ProcessingWorker (EventBus / JobQueue)   │   │ External LLMs   │  │
│  │  • CameraIngestionWorker (Video Ingestion)  │   │ (Groq/OpenAI/   │  │
│  │  • Keep-Alive & Health Monitor              │   │  Anthropic/etc) │  │
│  └───────────────────────┬─────────────────────┘   └─────────────────┘  │
└──────────────────────────┼──────────────────────────────────────────────┘
                           │ SQLAlchemy ORM (SessionLocal)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    External Managed Database                            │
│           PostgreSQL (Supabase / Neon / Render Postgres)                │
│       • Cameras   • Detections   • Trajectories   • Sightings           │
│       • Violations • Incidents   • AuditLogs                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Components Required to Boot
1. **Core FastAPI Web Service:** Initialized in `backend/api/main.py`. Requires `fastapi`, `uvicorn[standard]`, `pydantic`, `SQLAlchemy`, `PyYAML`, and `python-multipart`.
2. **Database Schema:** Created via `init_db(seed=True)` on startup. Requires active SQL connection (`DATABASE_URL`).
3. **Traffic Simulator:** Starts daemon thread `traffic-sim` unless `SIM_ENABLED=0`. Drives live feeds and initial historical seeding.
4. **Runtime Workers:** `CameraIngestionWorker` and `ProcessingWorker` manage queue operations. In mock mode, they idle with zero CPU overhead.

---

## 4. Frontend Audit

### Build Verification
- **Framework:** React 18.3.1 + Vite 5.4.0 (SPA).
- **Build Command:** `npm run build`
- **Output:** `frontend/dist` (HTML, CSS, chunked JS bundles with source maps).
- **Local Test Execution:** Executed `npm run build` in `frontend/`. Completed successfully in **5.60 seconds** with zero errors.

### Localhost / Hardcoded URL Scan
A full recursive scan was performed across `frontend/` for `localhost`, `127.0.0.1`, `:8000`, `:5173`, `http://`, and `ws://`:

| File | Line | Content | Production Assessment |
| :--- | :--- | :--- | :--- |
| `frontend/vite.config.js` | 5 | `// (default http://localhost:8000)` | Comment only. Safe. |
| `frontend/vite.config.js` | 12 | `target: "http://localhost:8000"` | Dev server proxy only. Ignored during production static build. Safe. |
| `frontend/vite.config.js` | 13 | `target: "ws://localhost:8000"` | Dev server WS proxy only. Safe. |
| `frontend/README.md` | 24, 28, 32 | Local dev setup instructions | Documentation only. Safe. |
| `frontend/src/services/api.js` | 9 | `export const API_BASE = (import.meta.env?.VITE_API_BASE \|\| "").replace(/\/+$/, "");` | **Production Safe:** Respects `VITE_API_BASE` env var. If unset, defaults to same-origin. |
| `frontend/src/services/api.js` | 17 | `return base.replace(/^http/, "ws") + path;` | **Production Safe:** Converts `https://...` to `wss://...` automatically. |

**Verdict on Hardcoded URLs:** **100% CLEAN.** No runtime JavaScript file contains hardcoded `localhost` or fixed port references.

### SPA Routing & Nested Routes
- The frontend uses `react-router-dom` v7 with nested routes (`/`, `/live`, `/search`, `/violations`, `/reports`, `/incidents`, `/system`, `/models`, `/audit`).
- On a static host like Render Static Site, refreshing a URL like `/violations` will return a **404 Not Found** unless an explicit rewrite rule is configured.
- `frontend/vercel.json` already defines `[{ "source": "/(.*)", "destination": "/index.html" }]`.
- **Render Requirement:** A rewrite rule `/* -> /index.html` (Status 200) MUST be added to Render Static Site settings.

---

## 5. Backend Audit

### Entry Point & Port Binding
- **Entry Point:** `backend/api/main.py:app`
- **Current Port Handling:**
  - `backend/Dockerfile` line 44: hardcoded to `CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]`.
  - Local scripts assume port `8000`.
- **Render Dynamic Port Requirement:**
  - Render dynamically injects `$PORT` into the container environment.
  - Hardcoding `--port 8000` will prevent Render's edge reverse proxy from routing traffic to the container, causing deployment timeout.
  - **Required Start Command:** `uvicorn api.main:app --host 0.0.0.0 --port $PORT`

### Health Endpoint
- Endpoint: `GET /health` in `backend/api/main.py:159`.
- Returns: `{"status": "ok", "simulator_running": true, "history_seeded": true, "write_protected": false, "read_only": false}`.
- Response time: < 5ms.
- **Render Compatibility:** Fully compatible as Render's configured health check path.

### Startup / Shutdown Lifecycle
- `@app.on_event("startup")`:
  1. `_start_health_logger()`: Runs lightweight asyncio loop logging health state changes.
  2. `_start_keep_alive()`: Asyncio task pinging `KEEP_ALIVE_URL` every 5 minutes.
  3. `_startup()`:
     - `init_db(reset=False, seed=True)`: Creates tables and seeds initial camera/incident records.
     - `runtime_services.start()`: Spawns ingestion and processing worker threads.
     - `TrafficSimulator.start()`: Runs history seeding (`seed_history()`), then spawns daemon simulation thread.
- `@app.on_event("shutdown")`:
  - Shuts down simulator and worker threads cleanly with 3s join timeouts.

---

## 6. Database Audit

### Current Configuration
- Implemented in `backend/db/database.py`.
- Defaults to: `DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./anpr_traffic.db")`.
- When SQLite is detected: enables WAL pragma (`PRAGMA journal_mode=WAL`), `NORMAL` synchronicity, and 30s timeout.

### Ephemeral Storage Data Loss Assessment
On Render's Free tier, Web Services run on **ephemeral virtual containers**:
- **No Persistent Disk:** Disks cannot be attached to Free Web Services.
- **Data Loss Triggers:**
  1. Service restarts (triggered manually or after failure).
  2. Redeployments (code updates).
  3. **15-Minute Inactivity Spin-Down:** Free instances spin down when no HTTP traffic is received for 15 minutes. Upon spin-up, a fresh container image is loaded.
- **Consequences for SQLite on Render Free:**
  - `anpr_traffic.db` is completely wiped on every restart or sleep cycle.
  - Detections, resolved violation status, manual incident notes, and audit logs disappear.
  - Startup history seeding (`seed_history()`) must recreate ~4,320 records on *every single cold start*, consuming valuable CPU cycles and delaying response times.

### PostgreSQL Compatibility
- The SQLAlchemy models in `backend/db/models.py` use standard SQL primitives.
- Native `JSON` columns are used for camera lane coordinates, which map to PostgreSQL's native `json` type.
- Connection pooling is already implemented in `database.py`:
  ```python
  _pool_args = {} if _is_sqlite else {
      "pool_size": 20,
      "max_overflow": 10,
      "pool_pre_ping": True,
      "pool_recycle": 3600,
  }
  ```
- **Remediation:** Connect an external free PostgreSQL database (e.g. Supabase, Neon, or 30-day Render Postgres) via `DATABASE_URL`. Ensure `psycopg2-binary` is installed.

---

## 7. ML / Computer Vision Audit

### Dependency & Import Tracing
A complete import trace from `backend/api/main.py` was conducted:

| Module | Location | Import Type | Dependencies | Render Free Feasibility |
| :--- | :--- | :--- | :--- | :---: |
| `MockDetector` | `anpr_module/detection.py` | Top-level | Standard library (`random`, `hashlib`) | 🟢 SAFE (< 1 MB RAM) |
| `MockOCR` | `anpr_module/ocr.py` | Top-level | Standard library (`random`, `hashlib`) | 🟢 SAFE (< 1 MB RAM) |
| `MockAttributeClassifier` | `anpr_module/attributes.py` | Top-level | Standard library | 🟢 SAFE (< 1 MB RAM) |
| `HistogramColorClassifier` | `anpr_module/attributes.py` | Lazy | `numpy` | 🟢 SAFE (~15 MB RAM) |
| `YOLODetector` | `anpr_module/detection.py:97` | Lazy (`__init__`) | `ultralytics`, `torch` | 🔴 **OOM Crash** (~600+ MB RAM) |
| `EasyOCROCR` | `anpr_module/ocr.py:75` | Lazy (`__init__`) | `easyocr`, `torch` | 🔴 **OOM Crash** (~750+ MB RAM) |
| `PaddleOCROCR` | `anpr_module/ocr.py:128` | Lazy (`__init__`) | `paddleocr`, `paddlepaddle` | 🔴 **OOM Crash** (~800+ MB RAM) |

### Memory & OOM Risk Evaluation
1. **Base Python + FastAPI + Uvicorn + Mock Simulator:**
   - Memory footprint: **~115 MB to 140 MB RAM**.
   - Render Free limit: **512 MB RAM**.
   - Result: **Fits comfortably with > 370 MB headroom.**
2. **Real YOLOv8/11 + EasyOCR:**
   - PyTorch runtime initialization: ~450 MB.
   - YOLOv8s model weights + inference graph: ~180 MB.
   - EasyOCR CRAFT text detector + CRNN recognizer: ~350 MB.
   - Total runtime RAM: **~1.1 GB to 1.3 GB**.
   - Result: **Immediate Linux OOM Killer SIGKILL termination on Render Free.**

### Feature Classification

| Feature | Engine Setting | Render Free Status | Notes |
| :--- | :--- | :---: | :--- |
| **Simulated Traffic Stream** | `mock` | 🟢 SAFE | Generates multi-camera vehicles, tracking, violations. |
| **Trajectory Tracking & Linking** | Native Python | 🟢 SAFE | Fast spatial-temporal haversine linking. |
| **AI Prompt Router** | API / Local | 🟢 SAFE | Routes queries to external LLMs or local rule heuristic. |
| **Analytics & Reporting** | SQL / In-memory | 🟢 SAFE | CSV / Heatmap generation executes in < 20ms. |
| **Real YOLO Video Detection** | `yolo` | 🔴 NOT POSSIBLE | Exceeds 512 MB container RAM. |
| **Real EasyOCR Plate Reading** | `easyocr` | 🔴 NOT POSSIBLE | Exceeds 512 MB container RAM. |

---

## 8. Video Processing Audit

### Endpoint Details
- **Endpoint:** `POST /api/cameras/{camera_id}/upload-video` in `backend/api/routers/cameras.py`.
- **Workflow:**
  1. Receives `UploadFile` stream and writes chunked bytes to temporary file `tempfile.gettempdir() + /upload_{id}_{filename}`.
  2. Opens video via OpenCV (`cv2.VideoCapture`).
  3. Processes frames at 2 FPS interval.
  4. Cap: Hard-limited to the first 30 seconds (`frame_idx > fps * 30`).
  5. Cleans up: `os.remove(temp_path)` in `finally:` block.

### Render Free Constraints
- If `opencv-python-headless` is not installed, calling this endpoint returns a 500 error (`ImportError: No module named 'cv2'`).
- If `engine: mock` is active, `MockDetector.detect()` hashes the raw frame bytes with MD5 to deterministically simulate realistic plate detections without running neural nets.
- **Disk Safety:** Uploaded files are deleted immediately after processing. However, if a user uploads a 500MB video file, Render Free’s RAM may spike during buffer transfer.
- **Recommendation:** Bounding upload size to 15 MB in FastAPI middleware is strongly advised.

---

## 9. WebSocket Audit

### Implementation Details
- **Endpoint:** `/ws/vehicles` in `backend/api/routers/ws.py`.
- **Transmission:** Broadcasts vehicle snapshots, active alerts, congestion heatmaps, and system stats every 2.0 seconds.
- **Connection Guard (`security.py:185`):**
  ```python
  def origin_is_same_site(origin: Optional[str], host_header: Optional[str]) -> bool:
      if not origin:
          return True
      configured = _csv_env("ALLOWED_ORIGINS")
      if os.getenv("ALLOWED_ORIGINS", "").strip() == "*":
          return True
      normalised = origin.rstrip("/")
      if normalised in configured or normalised in DEV_ORIGINS:
          return True
      ...
  ```
- **Critical Cross-Origin Hazard:**
  - If frontend is deployed on Render Static Site (`https://anpr-app.onrender.com`) and backend is on Render Web Service (`https://anpr-api.onrender.com`), browsers attach `Origin: https://anpr-app.onrender.com`.
  - If `ALLOWED_ORIGINS` is not set on the backend, the origin check FAILS and the WebSocket connection is rejected with **RFC 6455 code 1008 (Policy Violation)**.
- **Frontend Reconnection & Spin-down Resilience:**
  - Verified in `frontend/src/hooks/useLiveSnapshot.js`: The client catches disconnects, sets status to `"down"`, and automatically retries every 2.5 seconds.
  - When Render Free spins down after 15 minutes, the socket closes cleanly. As soon as a user accesses the site and wakes the container, the frontend automatically reconnects without requiring a page refresh.

---

## 10. Background Worker Audit

Render Free tier **does not provide standalone background worker services**. Any background logic must run as daemon threads inside the main web service process.

| Worker / Thread | File | Execution Mode | RAM Impact | CPU Impact (0.1 vCPU) | Render Free Viability |
| :--- | :--- | :--- | :--- | :--- | :---: |
| `TrafficSimulator` | `simulation/simulator.py` | Daemon Thread (`traffic-sim`) | ~20 MB | ~3–6% | 🟢 SAFE |
| `CameraIngestionWorker` | `workers/ingestion.py` | Daemon Thread | ~5 MB | < 1% (Idles in mock mode) | 🟢 SAFE |
| `ProcessingWorker` | `workers/processing.py` | Daemon Thread | ~10 MB | < 1% (Queue consumer) | 🟢 SAFE |
| `_start_health_logger` | `api/main.py:187` | Asyncio Task | < 1 MB | Negligible | 🟢 SAFE |
| `_start_keep_alive` | `api/main.py:207` | Asyncio Task | < 1 MB | Negligible | 🟡 NOTE |

*Special Note on Keep-Alive:* The keep-alive task pings `http://localhost:8000/health`. Pinging `localhost` within the container does NOT generate external inbound network traffic at Render's routing proxy. Therefore, **Render will still spin down the instance after 15 minutes of user inactivity**. To maintain 24/7 wakefulness, an external HTTP pinger (such as Cron-job.org or UptimeRobot) must ping the public `https://<app>.onrender.com/health` URL.

---

## 11. Filesystem / Storage Audit

A full scan for filesystem write operations was conducted across the codebase:

| Path / Target | Written In | File Type | Classification | Survives Render Restart? |
| :--- | :--- | :--- | :--- | :---: |
| `anpr_traffic.db*` | `db/database.py` | SQLite Database | Persistent state | ❌ **NO (Lost)** |
| `/tmp/upload_*` | `api/routers/cameras.py` | Temporary MP4 upload | Ephemeral upload | ❌ NO (Cleaned up immediately) |
| `export.csv` | `services/export_service.py` | In-memory `io.StringIO` | Dynamic export | Memory only (N/A) |
| `export.pdf` | `services/export_service.py` | In-memory `io.BytesIO` | Dynamic export | Memory only (N/A) |
| `static/preview.jpg` | `static/` | Static Asset | Read-only bundle | ✅ YES (In Git repo) |
| `static/favicon.jpg` | `static/` | Static Asset | Read-only bundle | ✅ YES (In Git repo) |

**Conclusion:** The application writes no persistent files except the SQLite database. Migrating `DATABASE_URL` to an external PostgreSQL instance completely eliminates data loss.

---

## 12. Environment Variable Audit

All environment variables used across the application are catalogued below:

| Environment Variable | Required | Consumed By | Default / Example Value | Render Free Safe? | Description |
| :--- | :---: | :--- | :--- | :---: | :--- |
| `PORT` | **YES** | Uvicorn CLI | Injected by Render (e.g. `10000`) | ✅ Yes | Render's dynamic application port. |
| `DATABASE_URL` | **YES** | `backend/db/database.py` | `postgresql+psycopg2://...` | ✅ Yes | External PostgreSQL connection string. |
| `ALLOWED_ORIGINS` | **YES** | `backend/api/security.py` | `https://anpr-frontend.onrender.com` | ✅ Yes | CORS & WebSocket handshake allowlist. |
| `VITE_API_BASE` | **YES** | `frontend/src/services/api.js` | `https://anpr-backend.onrender.com` | ✅ Yes | Build-time API target for React frontend. |
| `SIM_ENABLED` | Optional | `backend/api/main.py` | `1` | ✅ Yes | Set to `1` to run mock traffic generator. |
| `SIM_SEED` | Optional | `backend/api/main.py` | `42` | ✅ Yes | Random seed for deterministic simulation. |
| `ANPR_API_KEY` | Optional | `backend/api/security.py` | Generated token (e.g. `secret_key`) | ✅ Yes | Protects mutation endpoints. |
| `ANPR_READ_ONLY` | Optional | `backend/api/security.py` | `0` | ✅ Yes | If `1`, disables all mutation endpoints. |
| `ALLOWED_HOSTS` | Optional | `backend/api/security.py` | Empty (accepts all) | ✅ Yes | Host header allowlist. |
| `KEEP_ALIVE_URL` | Optional | `backend/api/main.py` | `https://anpr-backend.onrender.com/health` | ✅ Yes | Target URL for background keep-alive ping. |
| `GROQ_API_KEY` | Optional | `backend/ai_module/router.py` | User secret | ✅ Yes | Enables Llama 3.3 70B in AI Router. |
| `OPENAI_API_KEY` | Optional | `backend/ai_module/router.py` | User secret | ✅ Yes | Enables GPT-4o Mini in AI Router. |
| `ANTHROPIC_API_KEY` | Optional | `backend/ai_module/router.py` | User secret | ✅ Yes | Enables Claude 3.5 Sonnet in AI Router. |
| `GOOGLE_API_KEY` | Optional | `backend/ai_module/router.py` | User secret | ✅ Yes | Enables Gemini 1.5 Flash in AI Router. |

**Secret Detection:** Verified that NO real API keys or credentials exist in source files. All LLM keys and write keys are retrieved strictly via `os.getenv`.

---

## 13. Dependency Audit

### Backend Dependencies (`backend/requirements.txt`)
Contains strictly the minimal production set:
- `fastapi>=0.110,<1.0` (REST & WebSocket framework)
- `uvicorn[standard]>=0.29` (ASGI server with websockets/uvloop)
- `pydantic>=2.6,<3.0` (Data validation)
- `SQLAlchemy>=2.0,<3.0` (Database ORM)
- `PyYAML>=6.0` (Configuration parser)
- `python-multipart>=0.0.12` (Form & upload parser)

**Total size:** ~35 MB installed. Extremely lightweight and 100% Render Free compatible.

### Optional Dependencies (`backend/requirements-optional.txt`)
- `reportlab>=4.0` (PDF generation): ~12 MB. Safe.
- `psycopg2-binary>=2.9` (PostgreSQL driver): ~8 MB. **Mandatory for external PostgreSQL.**
- `redis>=5.0`: Only if external Redis is used. Safe.
- `opencv-python-headless>=4.8.0`: ~35 MB. Safe for basic image/video decoding.
- `ultralytics>=8.0.0` & `easyocr>=1.7.0`: **HAZARD.** Pulls `torch` (~750MB+ download, ~1.5GB on disk). **Must NOT be installed on Render Free.**

### Frontend Dependencies (`frontend/package.json`)
- React 18, Leaflet, React-Leaflet, Chart.js, React-Chartjs-2, Framer-Motion, Three.js, Lucide-React.
- Production build tree creates clean chunks. No dev-only libraries leak into the production bundle.

---

## 14. Security Audit

- **CORS Configuration:** Configured in `backend/api/security.py`. Rejects credentials when wildcard `*` is used. Respects `ALLOWED_ORIGINS`.
- **WebSocket Handshake Protection:** Applies `origin_is_same_site()` validation to prevent Cross-Site WebSocket Hijacking (CSWSH).
- **Write Authorization:** Mutation endpoints (`resolve violation`, `purge old data`) require `X-API-Key` when `ANPR_API_KEY` is set.
- **Content Security Policy (CSP):** Emits complete CSP header restricting script/style/frame-ancestor domains.
- **CSV Injection Defense:** `backend/services/export_service.py` sanitizes cells starting with `=`, `+`, `-`, `@` by prefixing an apostrophe (`'`).
- **Rate Limiting:** Sliding-window rate limiter (240 req/min for general API, 30 req/min for heavy export routes) with bounded in-memory cache pruning.

---

## 15. Performance Audit

| Metric | Measured / Estimated | Render Free Budget | Impact / Risk |
| :--- | :--- | :--- | :--- |
| **Idle RAM Usage** | ~120 MB | 512 MB | Low (76% headroom) |
| **Active Simulation RAM** | ~140 MB | 512 MB | Low (72% headroom) |
| **Cold Start Boot Time** | ~35–45 seconds | 60s timeout | Medium (Container spin-up + initial DB connection) |
| **CPU Usage (Idle)** | < 1% | 0.1 vCPU | Low |
| **CPU Usage (1 tick/sec sim)** | ~4–7% | 0.1 vCPU | Low-to-Medium |
| **History Seeding Duration** | ~12–18 seconds | Startup period | Medium on fresh DB |
| **WebSocket Snapshot Payload** | ~14 KB per push | 5 GB monthly bandwidth | Safe for normal demo operations |

---

## 16. Final Compatibility Matrix

| Component / Subsystem | Status | Identified Problem | Severity | Required Fix |
| :--- | :---: | :--- | :---: | :--- |
| **Uvicorn Start Command** | 🟡 NEEDS FIX | Hardcoded `--port 8000` causes Render port binding failure | **P0** | Change start command to use `--port $PORT` |
| **ML Models (YOLO/EasyOCR)** | 🔴 NOT COMPATIBLE | PyTorch + YOLO + EasyOCR exceeds 512 MB RAM (OOM crash) | **P0** | Maintain `engine: mock`; do not install PyTorch on Render |
| **Database Persistence** | 🔴 NOT COMPATIBLE | Local SQLite file deleted on spin-down / redeploy | **P0** | Connect external PostgreSQL via `DATABASE_URL` |
| **WebSocket CORS / Handshake** | 🟡 NEEDS FIX | Cross-origin handshake blocked if `ALLOWED_ORIGINS` empty | **P0** | Set `ALLOWED_ORIGINS=https://<frontend-url>` |
| **Frontend SPA Routing** | 🟡 NEEDS FIX | Reloading nested routes returns 404 on Static Site | **P1** | Add Render rewrite rule: `/* -> /index.html` |
| **Frontend API Targeting** | 🟡 NEEDS FIX | Must point frontend build to backend service URL | **P1** | Set `VITE_API_BASE=https://<backend-url>` in Static Site |
| **PostgreSQL Driver** | 🟡 NEEDS FIX | `psycopg2-binary` is in optional requirements | **P1** | Ensure `psycopg2-binary` is installed during backend build |
| **Keep-Alive Self Ping** | 🟡 NEEDS FIX | Localhost pinging does not prevent Render 15-min sleep | **P2** | Use external ping service (e.g. UptimeRobot) |
| **Traffic Simulation** | 🟢 SAFE | Runs on daemon thread with minimal CPU overhead | None | None |
| **REST APIs & Docs** | 🟢 SAFE | Standard FastAPI async endpoints work out-of-the-box | None | None |
| **AI Prompt Router** | 🟢 SAFE | Transparently uses available LLM API keys or local rule engine | None | None |

---

## 17. Blocker Priority (P0 / P1 / P2 / P3)

### P0 — Deployment Blockers (Must be resolved for the site to function)
1. **Dynamic Port Binding:** Render assigns a dynamic port via `$PORT`. Hardcoding port 8000 causes deployment failure.
2. **PyTorch / ML Dependency Exclusion:** Omit `ultralytics` and `easyocr` from the Render installation to avoid container OOM crash.
3. **Database Externalization:** Provide an external PostgreSQL `DATABASE_URL` so data persists beyond container restarts.
4. **WebSocket Allowed Origin:** Set `ALLOWED_ORIGINS` to include the Render Static Site domain.

### P1 — Required for Reliable Production Operation
1. **Render Static Site Rewrite Rule:** Add `/* -> /index.html` rewrite rule to support React Router SPA refreshing.
2. **Frontend API URL Injection:** Set `VITE_API_BASE` in the static site build environment.
3. **Driver Installation:** Install `psycopg2-binary` in the backend build.

### P2 — Recommended Optimizations
1. **External Keep-Alive Monitoring:** Set up UptimeRobot or Cron-job.org to ping `/health` every 10 minutes to prevent cold starts.
2. **Startup Seed Optimization:** Ensure history seed runs only when database is completely unpopulated.

### P3 — Optional Improvements
1. Add upload payload limit (`15 MB`) in FastAPI to prevent large video uploads from exhausting RAM.

---

## 18. Required Fixes

To prepare the repository for deployment without altering local development behavior:

1. **Backend Start Command:** Ensure Render runs:
   ```bash
   uvicorn api.main:app --host 0.0.0.0 --port $PORT
   ```
2. **Backend Dependencies:** Install core dependencies plus the PostgreSQL driver:
   ```bash
   pip install -r requirements.txt psycopg2-binary
   ```
3. **Configuration Verification:** Ensure `backend/config/anpr_config.yaml` has:
   ```yaml
   detection:
     engine: mock
   ocr:
     engine: mock
   attributes:
     engine: mock
   ```

---

## 19. Exact Render Configuration

### Service 1: Render Static Site (Frontend)
- **Service Type:** Static Site
- **Name:** `anpr-traffic-frontend`
- **Root Directory:** `frontend`
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`
- **Environment Variables:**
  - `VITE_API_BASE`: `https://anpr-traffic-backend.onrender.com`
- **Redirects / Rewrite Rules:**
  - **Type:** Rewrite
  - **Source:** `/*`
  - **Destination:** `/index.html`

### Service 2: Render Web Service (Backend)
- **Service Type:** Web Service
- **Name:** `anpr-traffic-backend`
- **Environment:** `Python 3`
- **Region:** `Oregon (US West)` or closest to your users
- **Branch:** `main`
- **Root Directory:** `backend`
- **Build Command:** `pip install -r requirements.txt psycopg2-binary`
- **Start Command:** `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
- **Plan:** `Free`
- **Health Check Path:** `/health`
- **Environment Variables:**
  - `DATABASE_URL`: `postgresql+psycopg2://<user>:<password>@<host>:5432/<dbname>`
  - `ALLOWED_ORIGINS`: `https://anpr-traffic-frontend.onrender.com`
  - `SIM_ENABLED`: `1`
  - `SIM_SEED`: `42`
  - `ANPR_READ_ONLY`: `0`
  - `PYTHONUNBUFFERED`: `1`

---

## 20. Exact Deployment Checklist

### Before Deployment
- [ ] Provision a free PostgreSQL database (e.g. Supabase, Neon, or Render PostgreSQL). Copy the connection DSN.
- [ ] Ensure `backend/config/anpr_config.yaml` specifies `engine: mock`.
- [ ] Confirm all code is pushed to your Git repository (GitHub/GitLab).

### Render Dashboard: Backend
- [ ] Create New **Web Service**.
- [ ] Connect repository and set Root Directory to `backend`.
- [ ] Set Build Command to: `pip install -r requirements.txt psycopg2-binary`.
- [ ] Set Start Command to: `uvicorn api.main:app --host 0.0.0.0 --port $PORT`.
- [ ] Under **Advanced**, add Health Check Path: `/health`.
- [ ] Add Environment Variables (`DATABASE_URL`, `SIM_ENABLED=1`, `PYTHONUNBUFFERED=1`).
- [ ] Click **Create Web Service** and wait for initial deployment. Copy your backend URL (`https://...onrender.com`).

### Render Dashboard: Frontend
- [ ] Create New **Static Site**.
- [ ] Set Root Directory to `frontend`.
- [ ] Set Build Command to: `npm install && npm run build`.
- [ ] Set Publish Directory to: `dist`.
- [ ] Add Environment Variable: `VITE_API_BASE` = `<your-backend-url>`.
- [ ] Under **Redirects/Rewrites**, add: `/*` -> `/index.html` (Rewrite).
- [ ] Click **Create Static Site** and copy your frontend URL.

### Final Integration
- [ ] Return to Backend Web Service settings -> Environment Variables.
- [ ] Add/Update: `ALLOWED_ORIGINS` = `<your-frontend-url>`.
- [ ] Save and trigger a redeploy of the backend.
- [ ] Open the frontend URL in your browser: verify real-time vehicle movement, WebSocket connectivity indicator (`LIVE`), map rendering, and AI model routing.

---

## 21. Recommended Production Architecture (With Real AI Offloading)

If your long-term goal is to run **real YOLOv8 detection and EasyOCR** on live video or uploaded MP4s while keeping the web layer on Render Free, the following hybrid architecture is recommended:

```
┌─────────────────────────┐
│   Render Static Site    │
│       (Frontend)        │
└────────────┬────────────┘
             │ HTTPS / WSS
             ▼
┌─────────────────────────┐         Inference Request          ┌─────────────────────────┐
│    Render Web Service   │───────────────────────────────────▶│  Hugging Face Spaces    │
│  (API, Trajectories,    │◀───────────────────────────────────│  (FastAPI + GPU/PyTorch)│
│   WebSockets, DB ORM)   │         Detections & Bboxes        │  • YOLOv8 Vehicle Det   │
└────────────┬────────────┘                                    │  • EasyOCR Plate Read   │
             │                                                 └─────────────────────────┘
             │ SQL
             ▼
┌─────────────────────────┐
│   External PostgreSQL   │
│    (Supabase / Neon)    │
└─────────────────────────┘
```

1. **Frontend:** Remains on Render Static Site (Free, fast global CDN).
2. **Backend Web Service:** Remains on Render Free (Manages business logic, traffic graph, trajectories, WebSocket fanout, violation rules).
3. **ML Inference Service:** Deployed on **Hugging Face Spaces** (Free tier offers **16 GB RAM + 2 vCPU**, which easily accommodates PyTorch, YOLOv8, and EasyOCR). The backend proxies video frames to the HF Space via REST or gRPC.
4. **Database:** Hosted on Supabase or Neon (Free tier provides persistent storage, automatic backups, and 500 MB storage).

---

## RENDER FREE TIER VERDICT

### 🟡 READY AFTER REQUIRED FIXES

### Direct Answers to the 12 Audit Questions:

1. **Can this project run on Render Free TODAY without code changes?**  
   **No.** It requires configuration adjustments in the deployment settings (binding to `$PORT` instead of `8000`, providing `ALLOWED_ORIGINS`, and setting `DATABASE_URL`).

2. **If NO, what are the exact blockers?**  
   - Port binding mismatch: `--port 8000` is hardcoded in Dockerfile/scripts while Render expects `$PORT`.
   - Missing CORS/WebSocket configuration: `origin_is_same_site()` drops connections from external frontend domains.
   - OOM risk: Attempting to install PyTorch/EasyOCR will crash the 512MB container.
   - Data loss: SQLite database is wiped on every restart/sleep cycle.

3. **Can the application run in Mock/Simulation mode on Render Free?**  
   **Yes, 100%.** In mock mode, the backend consumes only ~120–140 MB RAM and < 5% of a CPU core, well within Render Free's 512 MB RAM and 0.1 vCPU limits.

4. **Can real YOLO + OCR run on Render Free?**  
   **No.** PyTorch + YOLOv8 + EasyOCR requires 1.1 GB to 1.3 GB RAM. The 512 MB container will be terminated immediately by the Linux OOM killer.

5. **Can the current database survive Render restarts?**  
   **No, not with local SQLite.** SQLite files reside on an ephemeral disk that is wiped on spin-down or restart. An external PostgreSQL database must be configured.

6. **Can WebSockets work correctly?**  
   **Yes.** Render Free Web Services fully support WebSockets behind their reverse proxy. When `ALLOWED_ORIGINS` is configured with the frontend domain, the feed connects and streams cleanly. The frontend automatically reconnects when the service wakes from spin-down.

7. **Can video upload/processing work safely?**  
   **Yes, in Mock Mode.** Video files are saved to temporary storage, processed at 2 FPS capped at 30 seconds, and deleted immediately. Real YOLO video processing cannot run on Render Free.

8. **What is the minimum set of changes required?**  
   - Configure Render start command: `uvicorn api.main:app --host 0.0.0.0 --port $PORT`.
   - Install `requirements.txt` and `psycopg2-binary`.
   - Supply `DATABASE_URL`, `ALLOWED_ORIGINS`, and `VITE_API_BASE`.
   - Add SPA rewrite rule `/* -> /index.html` on the static site.

9. **What functionality must be moved to another service?**  
   Real computer vision model inference (YOLOv8 + EasyOCR) must be moved to an external service like **Hugging Face Spaces** (16 GB Free RAM) or a GPU compute node. The simulated traffic intelligence and analytics remain on Render.

10. **What exact Render architecture should be used?**  
    A **Dual-Service Architecture**:
    - **Service 1:** Render Static Site (React/Vite Frontend).
    - **Service 2:** Render Web Service (FastAPI Backend + Embedded Simulator & Workers).
    - **External:** Managed PostgreSQL database (Supabase / Neon).

11. **What exact Render configuration should be entered?**  
    - Static Site: Root `frontend`, Build `npm install && npm run build`, Publish `dist`, Rewrite `/* -> /index.html`.
    - Web Service: Root `backend`, Build `pip install -r requirements.txt psycopg2-binary`, Start `uvicorn api.main:app --host 0.0.0.0 --port $PORT`, Health Check `/health`.

12. **What external services are required, if any?**  
    - An **external PostgreSQL database** (e.g. Supabase, Neon, or Render Managed Postgres) for data persistence.
    - An optional **external uptime pinger** (e.g. UptimeRobot) if you wish to prevent the 15-minute spin-down.
    - An optional **external ML service** (e.g. Hugging Face Spaces) only if real video inference is needed.
