"""FastAPI application entrypoint.

Run from the ``backend`` directory:

    uvicorn api.main:app --reload

On startup it creates the SQLite schema, seeds cameras, and launches the
background :class:`TrafficSimulator` (unless ``SIM_ENABLED=0``). Interactive API
docs are at ``/docs``; the live dashboard is served from ``/``.

Request hardening (headers, CSP, rate limits, CORS, write authorisation) lives
in :mod:`api.security` — see that module for the environment variables that
tune it. The defaults are safe with no configuration at all.
"""
import os
import re
import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from api import security
from api.routers import analytics, cameras, vehicles, violations, ws, system
from db.init_db import init_db
from services.runtime_service import runtime_services
from simulation import TrafficSimulator

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

BASE_URL = os.getenv("BASE_URL", "https://city-wide-ai-engine-for-multi-camera.onrender.com")

simulator: TrafficSimulator | None = None

# ── Social-media / link-preview crawler user-agent patterns ──────────────
_BOT_UA_RE = re.compile(
    r"bot|crawl|spider|slurp|facebookexternalhit|Facebot|"
    r"LinkedInBot|Twitterbot|WhatsApp|TelegramBot|Discordbot|"
    r"Slackbot|Pinterestbot|Applebot|Google-Read-Aloud|"
    r"Embedly|Quora Link Preview|Showyoubot|outbrain|"
    r"Baiduspider|YandexBot|Sogou|vkShare|redditbot|W3C_Validator|"
    r"Iframely|fetch|preview|HeadlessChrome|PetalBot|SemrushBot|"
    r"OGP|OpenGraph|Postman|curl|wget|python-requests|httpx|aiohttp",
    re.IGNORECASE,
)

# Lightweight HTML page returned to crawlers. Contains only the OG / Twitter
# meta tags — no JavaScript, no CSS, no framework bundles. This loads in
# milliseconds even during a Render cold-start, which is critical because
# most social-media crawlers time out after 5 seconds.
_OG_HTML = f"""<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />

<!-- Primary Meta Tags -->
<title>City-Wide AI Engine for Multi-Camera Surveillance</title>
<meta name="title" content="City-Wide AI Engine for Multi-Camera Surveillance" />
<meta name="description" content="AI-powered multi-camera video analytics for intelligent city-wide surveillance, real-time monitoring, and automated video intelligence." />
<meta name="robots" content="index, follow" />
<meta name="author" content="ANPR Traffic Intelligence" />
<meta name="theme-color" content="#0a1628" />
<link rel="canonical" href="{BASE_URL}/" />

<!-- Open Graph / Facebook / WhatsApp / LinkedIn / Discord / Telegram -->
<meta property="og:type" content="website" />
<meta property="og:url" content="{BASE_URL}/" />
<meta property="og:title" content="City-Wide AI Engine for Multi-Camera Surveillance" />
<meta property="og:description" content="AI-powered multi-camera video analytics for intelligent city-wide surveillance, real-time monitoring, and automated video intelligence." />
<meta property="og:image" content="{BASE_URL}/preview.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:site_name" content="ANPR Traffic Intelligence Engine" />
<meta property="og:locale" content="en_US" />

<!-- Twitter / X -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:url" content="{BASE_URL}/" />
<meta name="twitter:title" content="City-Wide AI Engine for Multi-Camera Surveillance" />
<meta name="twitter:description" content="AI-powered multi-camera video analytics for intelligent city-wide surveillance, real-time monitoring, and automated video intelligence." />
<meta name="twitter:image" content="{BASE_URL}/preview.jpg" />

<!-- Favicon -->
<link rel="icon" type="image/jpeg" href="/favicon.jpg" />
<link rel="apple-touch-icon" href="/favicon.jpg" />
</head>
<body>
<h1>City-Wide AI Engine for Multi-Camera Surveillance</h1>
<p>AI-powered multi-camera video analytics for intelligent city-wide surveillance, real-time monitoring, and automated video intelligence.</p>
</body>
</html>"""


class CrawlerOGMiddleware(BaseHTTPMiddleware):
    """Intercept social-media crawlers and serve a lightweight OG-only page.

    Regular browser requests pass through untouched to the SPA. Crawlers get
    a tiny HTML response that contains all the Open Graph and Twitter Card
    metadata they need — no JS, no CSS, no 180 KB vendor bundle.
    """

    async def dispatch(self, request: Request, call_next):
        # Only intercept GET on the root path (the page being shared).
        if request.method == "GET" and request.url.path in ("/", ""):
            ua = (request.headers.get("user-agent") or "")
            if _BOT_UA_RE.search(ua):
                return HTMLResponse(
                    content=_OG_HTML,
                    status_code=200,
                    headers={
                        "Cache-Control": "public, max-age=3600",
                        "X-Robots-Tag": "all",
                    },
                )
        return await call_next(request)


def create_app() -> FastAPI:
    docs = security.docs_enabled()
    app = FastAPI(
        title="ANPR Traffic Intelligence Engine",
        version="0.1.0",
        description=(
            "City-wide Automatic Number Plate Recognition, cross-camera vehicle "
            "trajectory tracking, traffic-violation detection and analytics. "
            "Runs on simulated multi-camera data out of the box."
        ),
        # ENABLE_DOCS=0 removes the schema from a public deployment, where it
        # would otherwise hand out a complete map of the write endpoint.
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )

    # Middleware is applied outermost-last, so this reads inside-out: host check,
    # then CORS, then rate limiting, with security headers wrapping everything
    # (including 429s and CORS preflights).
    hosts = security.allowed_hosts()
    if hosts:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)
    app.add_middleware(CORSMiddleware, **security.cors_settings())
    app.add_middleware(security.RateLimitMiddleware)
    app.add_middleware(security.SecurityHeadersMiddleware)

    # Crawler middleware sits inside all the security layers so it benefits
    # from rate-limiting and CORS headers but intercepts before the router.
    app.add_middleware(CrawlerOGMiddleware)

    for module in (cameras, vehicles, violations, analytics, ws, system):
        app.include_router(module.router)

    @app.get("/health", tags=["system"], summary="Health check")
    def health():
        running = simulator is not None and simulator._thread is not None and simulator._thread.is_alive()
        return {"status": "ok", "simulator_running": running,
                "history_seeded": bool(simulator and simulator.seeded),
                **security.public_config()}

    # ── Explicit routes for OG assets (bypass StaticFiles race) ──────────
    @app.get("/preview.jpg", include_in_schema=False)
    def serve_preview():
        path = os.path.join(STATIC_DIR, "preview.jpg")
        if os.path.isfile(path):
            return FileResponse(
                path, media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=86400"},
            )
        return HTMLResponse("Not found", status_code=404)

    @app.get("/favicon.jpg", include_in_schema=False)
    def serve_favicon():
        path = os.path.join(STATIC_DIR, "favicon.jpg")
        if os.path.isfile(path):
            return FileResponse(
                path, media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=86400"},
            )
        return HTMLResponse("Not found", status_code=404)

    @app.on_event("startup")
    async def _start_health_logger():
        logger = logging.getLogger("health_monitor")
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            ch = logging.StreamHandler()
            ch.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
            logger.addHandler(ch)

        async def periodic_logger():
            last_status = None
            while True:
                await asyncio.sleep(5)
                status = health()
                if status != last_status:
                    logger.info(f"System Health Changed: {status}")
                    last_status = status
                
        asyncio.create_task(periodic_logger())

    @app.on_event("startup")
    async def _start_keep_alive():
        import urllib.request
        
        async def pinger():
            keep_alive_url = os.getenv("KEEP_ALIVE_URL", "http://localhost:8000/health")
            while True:
                await asyncio.sleep(300)  # 5 minutes
                try:
                    req = urllib.request.Request(keep_alive_url, headers={'User-Agent': 'KeepAlive/1.0'})
                    with urllib.request.urlopen(req, timeout=10):
                        pass
                except Exception as e:
                    logging.getLogger("keep_alive").debug(f"Keep-alive ping failed: {e}")
                    
        asyncio.create_task(pinger())

    @app.on_event("startup")
    def _startup():
        global simulator
        init_db(reset=False, seed=True)
        runtime_services.start()
        
        # Check current config mode
        from utils.config import get_anpr_config
        is_production = get_anpr_config().get("detection", {}).get("engine") != "mock"
        
        simulator = TrafficSimulator(seed=int(os.getenv("SIM_SEED", "42")))
        if os.getenv("SIM_ENABLED", "1") != "0" and not is_production:
            simulator.start()

    @app.on_event("shutdown")
    def _shutdown():
        if simulator is not None:
            simulator.stop()
        runtime_services.stop()

    # Serve the static control-room dashboard at the root (if built).
    if os.path.isdir(STATIC_DIR):
        app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="dashboard")

    return app


app = create_app()

