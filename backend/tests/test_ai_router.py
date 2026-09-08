from ai_module.router import classify_prompt, select_best_model, route_query

def test_ai_router_classification():
    tags = classify_prompt("Analyze vehicle plate accuracy across camera streams")
    assert "surveillance" in tags

def test_ai_router_selection():
    selection = select_best_model("Summarize daily traffic congestion")
    assert "name" in selection
    assert "provider" in selection

def test_ai_router_api(client):
    res = client.post("/api/ai/route-query", json={"prompt": "Identify high speed violations"})
    assert res.status_code == 200
    data = res.json()
    assert "selection" in data
    assert "response" in data

def test_ai_models_list(client):
    res = client.get("/api/ai/models")
    assert res.status_code == 200
    data = res.json()
    assert "models" in data
    assert "providers" in data
    # GROQ and GOOGLE providers should be active with configured keys
    assert data["providers"].get("groq") is True
    assert data["providers"].get("google") is True



