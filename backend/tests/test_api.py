"""HTTP API surface tests using FastAPI's TestClient.

The `client` fixture (conftest.py) starts the app with the simulator disabled,
so startup still creates the schema and seeds the five cameras. Assertions check
status codes and response *shapes* so they hold regardless of how much data the
isolated database happens to contain.
"""


def test_health_reports_ok_with_simulator_disabled(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["simulator_running"] is False       # SIM_ENABLED=0 in tests


def test_cameras_endpoint_lists_five_seeded_cameras(client):
    r = client.get("/api/cameras")
    assert r.status_code == 200
    cams = r.json()
    assert len(cams) == 5
    first = cams[0]
    assert {"id", "name", "position", "speed_limit_kmh", "lanes"} <= set(first)
    assert {"lat", "lng"} <= set(first["position"])


def test_live_vehicles_returns_a_list(client):
    r = client.get("/api/vehicles/live")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_stats_endpoint_returns_object(client):
    r = client.get("/api/stats")
    assert r.status_code == 200
    assert isinstance(r.json(), dict)


def test_violation_alerts_shape(client):
    r = client.get("/api/violations/alerts")
    assert r.status_code == 200
    body = r.json()
    assert {"total", "limit", "offset", "alerts"} <= set(body)
    assert isinstance(body["alerts"], list)


def test_violation_summary_shape(client):
    r = client.get("/api/violations/summary?hours=24")
    assert r.status_code == 200
    body = r.json()
    assert {"total", "by_type", "by_severity", "by_camera"} <= set(body)


def test_congestion_heatmap_has_one_cell_per_camera(client):
    r = client.get("/api/congestion/heatmap")
    assert r.status_code == 200
    cells = r.json()
    assert len(cells) == 5
    assert {"camera_id", "camera_name", "position", "vehicle_count", "level"} <= set(cells[0])


def test_daily_volume_shape(client):
    r = client.get("/api/reports/daily-volume")
    assert r.status_code == 200
    body = r.json()
    assert {"date", "total", "peak_hour", "by_hour", "by_camera"} <= set(body)
    assert len(body["by_hour"]) == 24


def test_reports_violations_summary_shape(client):
    r = client.get("/api/reports/violations-summary?hours=48")
    assert r.status_code == 200
    assert {"total", "by_type", "by_severity"} <= set(r.json())


def test_vehicle_search_shape(client):
    r = client.get("/api/vehicles/search?limit=5")
    assert r.status_code == 200
    body = r.json()
    assert {"total", "limit", "offset", "results"} <= set(body)
    assert isinstance(body["results"], list)


def test_journey_unknown_plate_is_404(client):
    r = client.get("/api/vehicles/ZZ-99-ZZ-0000/journey")
    assert r.status_code == 404


def test_export_csv_returns_csv(client):
    r = client.get("/api/violations/export.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")


def test_resolve_invalid_id_is_400(client):
    r = client.post("/api/violations/not-a-number/resolve", json={"notes": "x"})
    assert r.status_code == 400


def test_resolve_missing_violation_is_404(client):
    r = client.post("/api/violations/vio_999999/resolve", json={"notes": "x"})
    assert r.status_code == 404
