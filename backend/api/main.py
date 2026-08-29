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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles

from api import security
from api.routers import analytics, cameras, vehicles, violations, ws
from db.init_db import init_db
from services.runtime_service import runtime_services
from simulation import TrafficSimulator

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

simulator: TrafficSimulator | None = None


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

    for module in (cameras, vehicles, violations, analytics, ws):
        app.include_router(module.router)

    @app.get("/health", tags=["system"], summary="Health check")
    def health():
        running = simulator is not None and simulator._thread is not None and simulator._thread.is_alive()
        return {"status": "ok", "simulator_running": running,
                "history_seeded": bool(simulator and simulator.seeded),
                **security.public_config()}

    @app.on_event("startup")
    def _startup():
        global simulator
        init_db(reset=False, seed=True)
        runtime_services.start()
        simulator = TrafficSimulator(seed=int(os.getenv("SIM_SEED", "42")))
        if os.getenv("SIM_ENABLED", "1") != "0":
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
