"""Security layer: write authorisation, rate limiting, and response hardening.

The engine is designed to run two ways, and the defaults have to be safe in
both:

* **Local demo** — ``python -m uvicorn api.main:app``, trusted machine, nobody
  else can reach it. Zero configuration must still work.
* **Public tunnel** — ``scripts/host-public.ps1`` puts the very same process on
  the internet behind an HTTPS URL that anyone can open.

So nothing here blocks the local demo, but everything that *can* be tightened
without configuration is tightened unconditionally: security response headers,
a content-security policy, per-IP rate limits, same-origin WebSocket checks and
a connection ceiling. The one control that needs an explicit decision — who may
mutate data — is opt-in via ``ANPR_API_KEY`` and the hosting script turns it on
automatically, because a public URL with an unauthenticated write endpoint is
the single most damaging shape this app can take.

Environment variables (all optional):

===========================  ==============================================
``ANPR_API_KEY``             When set, mutating endpoints require this key in
                             ``X-API-Key`` (or ``Authorization: Bearer``).
``ANPR_READ_ONLY``           ``1`` rejects every mutation outright.
``ALLOWED_ORIGINS``          Comma-separated CORS allowlist. ``*`` allows any
                             origin but then forces credentials off.
``ALLOWED_HOSTS``            Comma-separated ``Host`` header allowlist.
``RATE_LIMIT_PER_MIN``       Per-IP requests/min for ``/api`` (default 240).
``RATE_LIMIT_HEAVY_PER_MIN`` Per-IP requests/min for exports/reports (30).
``RATE_LIMIT_ENABLED``       ``0`` disables rate limiting.
``WS_MAX_CONNECTIONS``       Concurrent WebSocket ceiling (default 64).
``CSP_ENABLED`` / ``CSP``    Disable or override the content-security policy.
``ENABLE_DOCS``              ``0`` hides ``/docs``, ``/redoc``, ``/openapi.json``.
===========================  ==============================================
"""
from __future__ import annotations

import os
import secrets
import time
from collections import deque
from typing import Deque, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from fastapi import HTTPException, Request, status
from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Re-exported deliberately: callers and tests reach for `security.like_escape`,
# while db.repository imports the same object for the query it builds.
from utils.sqlsafe import like_escape  # noqa: F401

API_KEY_HEADER = "X-API-Key"

#: Origins allowed by default so the Vite dev server keeps working. The bundled
#: dashboard is served from the API itself, so it is same-origin and needs none.
DEV_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:8000", "http://127.0.0.1:8000",
]

#: Prefixes whose handlers scan or aggregate unbounded row counts. They get a
#: much tighter budget than ordinary reads.
HEAVY_PREFIXES = (
    "/api/violations/export",
    "/api/violations/summary",
    "/api/reports/",
    "/api/vehicles/search",
)

TRUTHY = {"1", "true", "yes", "on"}


def _flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in TRUTHY


def _int_env(name: str, default: int, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


def _csv_env(name: str) -> List[str]:
    raw = os.getenv(name, "")
    return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]


# --------------------------------------------------------------- write auth ---
def api_key() -> str:
    """The configured write key, or ``""`` when writes are unauthenticated."""
    return os.getenv("ANPR_API_KEY", "").strip()


def read_only() -> bool:
    return _flag("ANPR_READ_ONLY")


def write_protected() -> bool:
    """True when a client must present a credential (or cannot write at all)."""
    return read_only() or bool(api_key())


def _presented_key(request: Request) -> str:
    supplied = request.headers.get(API_KEY_HEADER, "").strip()
    if supplied:
        return supplied
    auth = request.headers.get("authorization", "").strip()
    if auth[:7].lower() == "bearer ":
        return auth[7:].strip()
    return ""


def _as_bytes(value: str) -> bytes:
    """Encode for :func:`secrets.compare_digest`, whatever the client sent.

    ``compare_digest`` refuses ``str`` arguments containing non-ASCII characters
    and raises ``TypeError``. Starlette decodes headers as latin-1, so a single
    accented byte in ``X-API-Key`` would blow up *inside the auth guard* and be
    served as a 500 — an unauthenticated caller crashing the check that is
    supposed to stop them. Comparing bytes makes the guard total.
    """
    return value.encode("utf-8", "surrogateescape")


async def require_write_access(request: Request) -> None:
    """FastAPI dependency guarding every state-changing endpoint.

    Read the environment on each call rather than at import time so tests (and
    the hosting script) can flip the mode without reloading the module.
    """
    if read_only():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This deployment is read-only (ANPR_READ_ONLY=1).",
        )
    expected = api_key()
    if not expected:
        return  # Local, trusted deployment: no credential configured.
    presented = _presented_key(request)
    # compare_digest on byte strings avoids leaking the key length through
    # response timing.
    if not presented or not secrets.compare_digest(_as_bytes(presented),
                                                   _as_bytes(expected)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid X-API-Key is required to modify records.",
            headers={"WWW-Authenticate": f"Bearer, {API_KEY_HEADER}"},
        )


# ------------------------------------------------------------------- origins ---
def cors_settings() -> dict:
    """CORS kwargs.

    ``allow_origins=["*"]`` together with ``allow_credentials=True`` is invalid
    per spec, and Starlette resolves it by reflecting whatever ``Origin`` the
    request carried — i.e. "any site, with cookies". If a wildcard is asked for
    explicitly, credentials are forced off so it cannot become that.
    """
    raw = os.getenv("ALLOWED_ORIGINS", "").strip()
    if raw == "*":
        return {
            "allow_origins": ["*"], "allow_credentials": False,
            "allow_methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", API_KEY_HEADER],
            "max_age": 600,
        }
    origins = _csv_env("ALLOWED_ORIGINS") or list(DEV_ORIGINS)
    return {
        "allow_origins": origins, "allow_credentials": True,
        "allow_methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", API_KEY_HEADER],
        "max_age": 600,
    }


def allowed_hosts() -> Optional[List[str]]:
    hosts = _csv_env("ALLOWED_HOSTS")
    return hosts or None


def origin_is_same_site(origin: Optional[str], host_header: Optional[str]) -> bool:
    """Whether ``origin`` may talk to us.

    WebSockets are exempt from CORS, so the browser will happily let any page
    open ``/ws/vehicles``. This is the equivalent check, applied by hand.

    A missing ``Origin`` means a non-browser client (curl, a Python script) and
    is allowed: the threat being closed off is *another website* driving a
    visitor's browser, and browsers always send ``Origin`` on WebSocket
    handshakes.
    """
    if not origin:
        return True
    configured = _csv_env("ALLOWED_ORIGINS")
    if os.getenv("ALLOWED_ORIGINS", "").strip() == "*":
        return True
    normalised = origin.rstrip("/")
    if normalised in configured or normalised in DEV_ORIGINS:
        return True
    if host_header:
        try:
            if urlparse(normalised).netloc.lower() == host_header.strip().lower():
                return True
        except ValueError:
            return False
    return False


# ------------------------------------------------------- websocket ceiling ---
class ConnectionLimiter:
    """Counts live WebSocket connections so a client cannot fan out endlessly.

    Every accepted socket owns a task pushing a full snapshot every couple of
    seconds, and the deployment is deliberately pinned to one worker, so a few
    thousand sockets from one machine would starve the dashboard.
    """

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.active = 0

    def acquire(self) -> bool:
        limit = _int_env("WS_MAX_CONNECTIONS", self.limit)
        if self.active >= limit:
            return False
        self.active += 1
        return True

    def release(self) -> None:
        self.active = max(0, self.active - 1)


ws_connections = ConnectionLimiter(limit=64)


# ---------------------------------------------------------- rate limiting ---
class RateLimitMiddleware:
    """Sliding-window per-IP limiter for ``/api`` routes.

    Only the API is limited: static assets are same-origin and cheap, and
    throttling them would break a page load rather than an attack. Two budgets
    are kept — a generous one for ordinary reads, and a tight one for the
    export/report endpoints that materialise large result sets.
    """

    WINDOW_S = 60.0
    MAX_TRACKED_CLIENTS = 4096

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._hits: Dict[str, Deque[float]] = {}

    # -- helpers
    @staticmethod
    def _client(scope: Scope) -> str:
        client = scope.get("client")
        return client[0] if client else "unknown"

    @staticmethod
    def _budget(path: str) -> int:
        if path.startswith(HEAVY_PREFIXES):
            return _int_env("RATE_LIMIT_HEAVY_PER_MIN", 30)
        return _int_env("RATE_LIMIT_PER_MIN", 240)

    def _over_budget(self, key: str, budget: int, now: float) -> bool:
        window = self._hits.setdefault(key, deque())
        cutoff = now - self.WINDOW_S
        while window and window[0] < cutoff:
            window.popleft()
        if len(window) >= budget:
            return True
        window.append(now)
        return False

    def _prune(self, now: float) -> None:
        """Keep the per-IP table bounded.

        Stale windows go first. If every tracked client is still active the
        cheap sweep frees nothing, so the coldest entries are dropped outright —
        an unbounded dict keyed by remote address is a slow memory leak, and
        losing a window only means a client gets a fresh budget.
        """
        if len(self._hits) <= self.MAX_TRACKED_CLIENTS:
            return
        cutoff = now - self.WINDOW_S
        for key in [k for k, w in self._hits.items() if not w or w[-1] < cutoff]:
            self._hits.pop(key, None)
        excess = len(self._hits) - self.MAX_TRACKED_CLIENTS
        if excess > 0:
            coldest = sorted(self._hits, key=lambda k: self._hits[k][-1])[:excess]
            for key in coldest:
                self._hits.pop(key, None)

    # -- ASGI
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if (scope["type"] != "http" or not path.startswith("/api")
                or not _flag("RATE_LIMIT_ENABLED", "1")):
            await self.app(scope, receive, send)
            return

        now = time.monotonic()
        self._prune(now)
        bucket = "heavy" if path.startswith(HEAVY_PREFIXES) else "normal"
        key = f"{self._client(scope)}|{bucket}"
        if self._over_budget(key, self._budget(path), now):
            response = JSONResponse(
                {"detail": "Rate limit exceeded. Slow down and retry shortly."},
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": "30"},
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


# ------------------------------------------------------- response hardening ---
DEFAULT_CSP = "; ".join([
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    # Map tiles come from OpenStreetMap; data: covers inline SVG chrome.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    # Leaflet and Chart.js write element.style directly, which style-src
    # governs — hence 'unsafe-inline' here but deliberately NOT in script-src.
    ("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com "
     "https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net"),
    ("script-src 'self' https://cdnjs.cloudflare.com https://unpkg.com "
     "https://cdn.jsdelivr.net"),
    "connect-src 'self' ws: wss:",
    "worker-src 'self' blob:",
])


class SecurityHeadersMiddleware:
    """Adds the headers a control-room UI should never ship without.

    ``frame-ancestors``/``X-Frame-Options`` matter most here: without them the
    dashboard can be framed invisibly and an operator's click can be routed
    into the resolve action.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        is_api = path.startswith("/api") or path == "/health"
        secure = self._is_https(scope)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Referrer-Policy", "no-referrer")
                headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
                headers.setdefault(
                    "Permissions-Policy",
                    "geolocation=(), microphone=(), camera=(), usb=()",
                )
                if _flag("CSP_ENABLED", "1"):
                    headers.setdefault(
                        "Content-Security-Policy", os.getenv("CSP", DEFAULT_CSP))
                if is_api:
                    # ANPR output is plate-to-location data; keep it out of
                    # shared caches and browser history entirely.
                    headers.setdefault("Cache-Control", "no-store")
                if secure:
                    headers.setdefault(
                        "Strict-Transport-Security", "max-age=31536000")
            await send(message)

        await self.app(scope, receive, send_with_headers)

    @staticmethod
    def _is_https(scope: Scope) -> bool:
        if scope.get("scheme") == "https":
            return True
        for name, value in scope.get("headers", ()):
            if name == b"x-forwarded-proto":
                return value.split(b",")[0].strip().lower() == b"https"
        return False


# ------------------------------------------------------------------ helpers ---
# ``like_escape`` is re-exported at the top of this module from utils.sqlsafe, so
# there is exactly one escaping routine in the codebase: the one db.repository
# actually applies to the LIKE pattern. A second copy here would let the two
# drift apart while the test suite kept passing against the copy nobody calls.


def docs_enabled() -> bool:
    return _flag("ENABLE_DOCS", "1")


def public_config() -> dict:
    """Non-sensitive posture summary, surfaced on ``/health``.

    The dashboard uses ``write_protected`` to decide whether to ask for a key
    before it tries to resolve a violation.
    """
    return {
        "write_protected": write_protected(),
        "read_only": read_only(),
    }


def summary_lines() -> Iterable[str]:
    """Human-readable posture, printed by the hosting script."""
    if read_only():
        yield "writes: disabled (ANPR_READ_ONLY=1)"
    elif api_key():
        yield "writes: require X-API-Key"
    else:
        yield "writes: OPEN - set ANPR_API_KEY before exposing this publicly"
    yield f"rate limit: {_int_env('RATE_LIMIT_PER_MIN', 240)}/min per IP"
    yield f"websockets: max {_int_env('WS_MAX_CONNECTIONS', 64)} concurrent"
