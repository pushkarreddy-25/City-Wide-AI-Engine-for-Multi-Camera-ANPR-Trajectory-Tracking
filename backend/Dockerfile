# ANPR Traffic Intelligence Engine — backend image
# Build context is ./backend (see docker-compose.yml).
FROM python:3.11-slim

# Faster, quieter Python; no .pyc clutter.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

# System deps: libpq for psycopg2 (PostgreSQL production path).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first for better layer caching.
COPY requirements.txt requirements-optional.txt ./
RUN pip install -r requirements.txt \
    && pip install -r requirements-optional.txt

# Unprivileged runtime account. A container process that starts as root keeps
# root's capabilities for the whole life of the container, so a bug in the app
# is a bug with root in the namespace. Created before COPY so the layer caches.
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin anpr

# App code (config/ and static/ live inside backend/). See .dockerignore — the
# local virtualenv, the SQLite database and any .env stay out of the image.
COPY . .

# The SQLite fallback writes its database into the working directory, so the
# runtime user has to own it. The Postgres path (docker-compose) writes nothing
# here, but the image should still run standalone.
RUN chown -R anpr:anpr /app

USER anpr

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# One worker: the in-process background simulator must be a singleton.
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
