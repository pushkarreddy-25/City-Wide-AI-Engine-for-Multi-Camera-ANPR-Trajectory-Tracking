"""Database engine and session management.

Defaults to a local SQLite file so the project runs with zero setup. Set the
``DATABASE_URL`` environment variable (e.g. a PostgreSQL DSN) to switch to the
production database described in the architecture document — no code changes
required.
"""
import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

# e.g. postgresql+psycopg2://user:pass@localhost:5432/anpr_traffic
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./anpr_traffic.db")

_is_sqlite = DATABASE_URL.startswith("sqlite")
# A generous timeout + WAL journaling let the background simulator write while
# API requests read, without "database is locked" errors.
_connect_args = {"check_same_thread": False, "timeout": 30} if _is_sqlite else {}

engine = create_engine(DATABASE_URL, connect_args=_connect_args, future=True)


if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA busy_timeout=30000")
        cur.close()

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,   # keep attributes usable after commit (API serialization)
    future=True,
)

Base = declarative_base()


def get_db():
    """FastAPI dependency: yield a session and always close it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
