def test_incidents_crud(client):
    # Create incident
    res = client.post("/api/incidents/", json={
        "title": "Speed Violation Test",
        "description": "Vehicle going 95 km/h",
        "severity": "High",
        "camera_id": "CAM-001",
        "assigned_unit": "Patrol 1"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "Speed Violation Test"
    assert data["status"] == "Open"
    inc_id = data["id"]

    # List incidents
    res_list = client.get("/api/incidents/")
    assert res_list.status_code == 200
    assert len(res_list.json()) >= 1

    # Update incident status
    res_patch = client.patch(f"/api/incidents/{inc_id}", json={"status": "Resolved"})
    assert res_patch.status_code == 200
    assert res_patch.json()["status"] == "Resolved"

