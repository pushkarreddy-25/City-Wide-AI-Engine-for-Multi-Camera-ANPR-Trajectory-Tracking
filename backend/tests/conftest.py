"""Shared pytest fixtures and test-environment isolation.

This module runs *before* any test imports the application. It points the
engine at a throwaway SQLite file and disables the background simulator so the
suite is hermetic — it never touches a developer's real database or spawns the
live traffic thread.
"""
import os
import tempfile

# --- isolate the environment BEFORE app modules import db.database -----------
# db/database.py reads DATABASE_URL at import time, so these must be set here,
# at conftest import (which pytest loads before collecting any test module).
_TEST_DB = os.path.join(tempfile.mkdtemp(prefix="anpr_test_"), "test.db")
os.environ["DATABASE_URL"] = "sqlite:///" + _TEST_DB.replace("\\", "/")
os.environ["SIM_ENABLED"] = "0"          # never start the background thread in tests
os.environ["CACHE_BACKEND"] = "memory"
os.environ.setdefault("SIM_SEED", "42")
# The suite fires many requests from one "IP" in well under a minute, so the
# per-IP limiter would make results depend on test ordering. Security-specific
# behaviour is asserted in test_security.py, which enables it explicitly.
os.environ["RATE_LIMIT_ENABLED"] = "0"
os.environ.pop("ANPR_API_KEY", None)
os.environ.pop("ANPR_READ_ONLY", None)

import pytest  # noqa: E402


@pytest.fixture()
def fresh_db():
    """Drop, recreate and camera-seed the schema; yield the session factory.

    Function-scoped so every DB test starts from a known-empty database.
    """
    from db.init_db import init_db
    from db.database import SessionLocal

    init_db(reset=True, seed=True)
    yield SessionLocal


@pytest.fixture()
def db_session(fresh_db):
    """A single SQLAlchemy session on a freshly reset database."""
    session = fresh_db()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    """A FastAPI TestClient with lifespan startup (seeds cameras) triggered.

    The simulator is disabled (SIM_ENABLED=0) so no thread runs; startup still
    creates tables and seeds the five cameras, giving endpoints real config.
    """
    from fastapi.testclient import TestClient
    from api.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture()
def sample_cameras():
    """A minimal two-camera network with real Nagpur-ish coordinates.

    ~555 m apart (0.005 deg latitude), which keeps a 2-minute hop comfortably
    feasible and a 5-second hop physically impossible — used by the linker and
    violation tests without depending on the YAML config.
    """
    return {
        "cam_1": {"name": "Sitabuldi", "latitude": 21.1450, "longitude": 79.0880,
                  "speed_limit_kmh": 50, "stop_line_y": 430, "lanes": [320, 640, 960]},
        "cam_2": {"name": "Dhantoli", "latitude": 21.1500, "longitude": 79.0880,
                  "speed_limit_kmh": 40, "stop_line_y": 430, "lanes": [320, 640, 960]},
    }
