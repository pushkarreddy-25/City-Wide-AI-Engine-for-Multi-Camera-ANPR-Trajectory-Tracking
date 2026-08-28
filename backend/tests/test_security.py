"""Security behaviour of the API surface.

The rest of the suite runs with the protections relaxed (see ``conftest.py``:
rate limiting off, no write key) so that ordinary endpoint tests do not depend
on request ordering. This module turns each control on deliberately and asserts
it actually bites — the controls are only worth having if they are exercised.
"""
import pytest
from starlette.websockets import WebSocketDisconnect

from api import security


# --------------------------------------------------------------- write auth ---
RESOLVE = "/api/violations/abc123/resolve"


def test_resolve_is_open_when_no_key_configured(client):
    """The zero-config local demo must keep working: no key, no challenge.

    The id does not exist, so the interesting part is what it is *not* — a 401.
    """
    res = client.post(RESOLVE, json={"notes": ""})
    assert res.status_code != 401


def test_resolve_requires_key_when_configured(client, monkeypatch):
    monkeypatch.setenv("ANPR_API_KEY", "s3cret-key")
    res = client.post(RESOLVE, json={"notes": ""})
    assert res.status_code == 401
    # Tell the client how to authenticate rather than leaving it guessing.
    assert "X-API-Key" in res.headers.get("www-authenticate", "")


def test_resolve_rejects_a_wrong_key(client, monkeypatch):
    monkeypatch.setenv("ANPR_API_KEY", "s3cret-key")
    res = client.post(RESOLVE, json={"notes": ""}, headers={"X-API-Key": "guess"})
    assert res.status_code == 401


def test_a_non_ascii_key_is_rejected_not_crashed(client, monkeypatch):
    """``compare_digest`` refuses non-ASCII ``str``, and headers arrive latin-1
    decoded. Without encoding to bytes the guard raises TypeError and the caller
    gets a 500 — an unauthenticated request crashing the check meant to stop it.

    The header is given as *bytes* because httpx encodes ``str`` header values as
    ASCII and would fail in the client instead of putting the hostile value on
    the wire, which is what a real attacker's socket does.
    """
    monkeypatch.setenv("ANPR_API_KEY", "s3cret-key")
    res = client.post(RESOLVE, json={"notes": ""},
                      headers={"X-API-Key": "cle-privee\xe9".encode("latin-1")})
    assert res.status_code == 401


def test_key_comparison_survives_any_byte_a_client_can_send():
    """Unit-level twin of the above, independent of the HTTP client's encoding."""
    import secrets as _secrets
    hostile = security._as_bytes("cle-privee\xe9")
    assert _secrets.compare_digest(hostile, security._as_bytes("s3cret-key")) is False
    assert _secrets.compare_digest(security._as_bytes("same"),
                                   security._as_bytes("same")) is True


def test_resolve_accepts_the_right_key(client, monkeypatch):
    monkeypatch.setenv("ANPR_API_KEY", "s3cret-key")
    res = client.post(RESOLVE, json={"notes": ""}, headers={"X-API-Key": "s3cret-key"})
    assert res.status_code != 401          # past the guard; the id is still bogus


def test_resolve_accepts_a_bearer_token(client, monkeypatch):
    monkeypatch.setenv("ANPR_API_KEY", "s3cret-key")
    res = client.post(RESOLVE, json={"notes": ""},
                      headers={"Authorization": "Bearer s3cret-key"})
    assert res.status_code != 401


def test_read_only_mode_refuses_writes_even_with_a_key(client, monkeypatch):
    monkeypatch.setenv("ANPR_READ_ONLY", "1")
    monkeypatch.setenv("ANPR_API_KEY", "s3cret-key")
    res = client.post(RESOLVE, json={"notes": ""}, headers={"X-API-Key": "s3cret-key"})
    assert res.status_code == 403


def test_read_only_mode_still_allows_reads(client, monkeypatch):
    monkeypatch.setenv("ANPR_READ_ONLY", "1")
    assert client.get("/api/cameras").status_code == 200


def test_health_advertises_the_write_posture(client, monkeypatch):
    monkeypatch.setenv("ANPR_API_KEY", "s3cret-key")
    body = client.get("/health").json()
    assert body["write_protected"] is True
    assert body["read_only"] is False


# ------------------------------------------------------------ input bounds ---
def test_notes_longer_than_the_column_are_rejected(client):
    """SQLite does not enforce VARCHAR(500), so Pydantic is the only bound."""
    res = client.post(RESOLVE, json={"notes": "x" * 501})
    assert res.status_code == 422


@pytest.mark.parametrize("plate", ["%", "_", "<script>", "a' OR '1'='1", "x" * 21])
def test_search_rejects_malformed_plates(client, plate):
    """`%`/`_` are LIKE wildcards; the rest simply have no business in a plate."""
    res = client.get("/api/vehicles/search", params={"plate": plate})
    assert res.status_code == 422


def test_search_accepts_a_real_plate(client):
    res = client.get("/api/vehicles/search", params={"plate": "MH-31-AB-1234"})
    assert res.status_code == 200


def test_deep_offsets_are_capped(client):
    """SQLite walks and discards every skipped row, so an unbounded offset is a
    free full-table scan for the caller."""
    assert client.get("/api/violations/alerts", params={"offset": 10_000_001}).status_code == 422
    assert client.get("/api/violations/alerts", params={"offset": 0}).status_code == 200


def test_unknown_violation_type_is_rejected(client):
    assert client.get("/api/violations/alerts", params={"type": "bogus"}).status_code == 422


def test_journey_404_does_not_echo_the_plate_back(client):
    """A 404 body that reflects input is a free reflected-content channel."""
    res = client.get("/api/vehicles/ZZ-99-ZZ-0000/journey")
    assert res.status_code == 404
    assert "ZZ-99-ZZ-0000" not in res.text


def test_like_escape_neutralises_wildcards():
    assert security.like_escape("100%") == "100\\%"
    assert security.like_escape("a_b") == "a\\_b"
    assert security.like_escape("back\\slash") == "back\\\\slash"


def test_the_escaped_helper_is_the_one_the_query_layer_uses():
    """Guards against the assertion above going vacuous.

    There used to be two copies of this routine — one in ``api.security`` that the
    tests checked, and a private one in ``db.repository`` that actually built the
    LIKE pattern. Either could regress without the suite noticing.
    """
    from db import repository
    assert repository.like_escape is security.like_escape


def test_csv_export_neutralises_spreadsheet_formulas():
    """Plate text comes from OCR, so a cell can start with '=' or '@'.

    Excel and LibreOffice evaluate such a cell as a formula the moment the export
    is opened, which turns a read-only report into code execution on the
    operator's machine.
    """
    from services import export_service
    for hostile in ("=1+1", "+1", "-1", "@SUM(A1)", "  =HYPERLINK(\"http://x\")"):
        assert export_service._cell(hostile).startswith("'")
    # Ordinary values must survive untouched, and numbers must stay numbers.
    assert export_service._cell("MH-31-AB-1234") == "MH-31-AB-1234"
    assert export_service._cell("Sitabuldi Square") == "Sitabuldi Square"
    assert export_service._cell(42) == 42
    assert export_service._cell(None) is None


def test_analytics_queries_are_row_capped():
    from db import repository
    assert repository.MAX_ANALYTICS_ROWS <= 1_000_000


def test_csv_export_is_row_capped():
    """The export used to ask for 100k rows and build them all in memory."""
    from services import export_service
    assert export_service.CSV_MAX_ROWS <= 10_000


# --------------------------------------------------------- response headers ---
def test_security_headers_on_the_dashboard(client):
    res = client.get("/")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["referrer-policy"] == "no-referrer"
    assert "geolocation=()" in res.headers["permissions-policy"]


def test_csp_forbids_inline_script(client):
    csp = client.get("/").headers["content-security-policy"]
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp
    script_src = [d for d in csp.split(";") if d.strip().startswith("script-src")][0]
    # Inline styles are unavoidable (Leaflet writes element.style); inline
    # *scripts* are not, and that is the directive that stops an injected
    # <script> from running.
    assert "unsafe-inline" not in script_src
    assert "unsafe-eval" not in csp


def test_api_responses_are_not_cached(client):
    """Plate-to-location data should not sit in a shared cache or history."""
    assert client.get("/api/cameras").headers["cache-control"] == "no-store"
    assert client.get("/health").headers["cache-control"] == "no-store"


def test_hsts_only_when_the_request_arrived_over_tls(client):
    plain = client.get("/health")
    assert "strict-transport-security" not in plain.headers
    tunnelled = client.get("/health", headers={"x-forwarded-proto": "https"})
    assert "max-age=" in tunnelled.headers["strict-transport-security"]


def test_csp_can_be_disabled(client, monkeypatch):
    monkeypatch.setenv("CSP_ENABLED", "0")
    assert "content-security-policy" not in client.get("/").headers


# ----------------------------------------------------------- rate limiting ---
def test_rate_limit_returns_429_with_retry_after(client, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "1")
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "3")
    codes = [client.get("/api/cameras").status_code for _ in range(6)]
    assert codes[:3] == [200, 200, 200]
    assert 429 in codes
    blocked = client.get("/api/cameras")
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "30"


def test_static_assets_are_not_rate_limited(client, monkeypatch):
    """Throttling the dashboard's own files would break a page load, not an
    attack — only /api is metered."""
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "1")
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "1")
    assert all(client.get("/").status_code == 200 for _ in range(5))


# --------------------------------------------------------------- websocket ---
def test_websocket_rejects_a_foreign_origin(client):
    """WebSockets are exempt from CORS, so this check is the only thing stopping
    another site from opening the live feed in a visitor's browser."""
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            "/ws/vehicles", headers={"origin": "https://evil.example"}
        ) as ws:
            ws.receive_text()


def test_websocket_accepts_a_same_origin_handshake(client):
    with client.websocket_connect(
        "/ws/vehicles", headers={"origin": "http://testserver"}
    ) as ws:
        assert ws is not None


def test_websocket_allows_a_non_browser_client(client):
    """No Origin header means curl or a Python script, not a hostile page."""
    with client.websocket_connect("/ws/vehicles") as ws:
        assert ws is not None


def test_connection_limiter_caps_and_releases(monkeypatch):
    monkeypatch.setenv("WS_MAX_CONNECTIONS", "1")
    limiter = security.ConnectionLimiter(limit=1)
    assert limiter.acquire() is True
    assert limiter.acquire() is False
    limiter.release()
    assert limiter.acquire() is True


# ------------------------------------------------------------------ origins ---
def test_wildcard_origin_forces_credentials_off(monkeypatch):
    """`allow_origins=['*']` with credentials makes Starlette reflect whatever
    Origin arrived — i.e. "any site, with cookies"."""
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")
    settings = security.cors_settings()
    assert settings["allow_origins"] == ["*"]
    assert settings["allow_credentials"] is False


def test_configured_origins_are_parsed_and_normalised(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://ops.example.gov/, https://b.example ")
    settings = security.cors_settings()
    assert settings["allow_origins"] == ["https://ops.example.gov", "https://b.example"]
    assert settings["allow_credentials"] is True


def test_cors_does_not_allow_arbitrary_methods(monkeypatch):
    assert set(security.cors_settings()["allow_methods"]) == {"GET", "POST", "OPTIONS"}


def test_origin_is_same_site_rules(monkeypatch):
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    assert security.origin_is_same_site(None, "anything") is True
    assert security.origin_is_same_site("http://anpr.example", "anpr.example") is True
    assert security.origin_is_same_site("http://evil.example", "anpr.example") is False
    assert security.origin_is_same_site("http://localhost:5173", "anpr.example") is True

    monkeypatch.setenv("ALLOWED_ORIGINS", "https://ops.example.gov")
    assert security.origin_is_same_site("https://ops.example.gov", "other") is True
    assert security.origin_is_same_site("https://ops.example.gov.evil", "other") is False


def test_allowed_hosts_defaults_to_off(monkeypatch):
    """Unset means "skip the middleware" — a Host allowlist that defaults to
    localhost would break every LAN and tunnel demo."""
    monkeypatch.delenv("ALLOWED_HOSTS", raising=False)
    assert security.allowed_hosts() is None
    monkeypatch.setenv("ALLOWED_HOSTS", "anpr.example.gov, localhost")
    assert security.allowed_hosts() == ["anpr.example.gov", "localhost"]


def test_docs_can_be_hidden(monkeypatch):
    assert security.docs_enabled() is True
    monkeypatch.setenv("ENABLE_DOCS", "0")
    assert security.docs_enabled() is False
