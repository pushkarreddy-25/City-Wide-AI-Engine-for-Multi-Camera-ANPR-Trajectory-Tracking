from fastapi import APIRouter
from pydantic import BaseModel
from ai_module.router import route_query, get_available_providers, MODELS

router = APIRouter(prefix="/api/ai", tags=["ai-router"])



class QueryRequest(BaseModel):
    prompt: str


@router.post("/route-query")
def process_ai_query(payload: QueryRequest):
    return route_query(payload.prompt)


@router.get("/models")
def get_ai_models():
    providers = get_available_providers()
    model_list = []
    for mid, cfg in MODELS.items():
        model_list.append({
            "id": mid,
            "name": cfg["name"],
            "provider": cfg["provider"],
            "cost_in": cfg["cost_in"],
            "cost_out": cfg["cost_out"],
            "tags": list(cfg["tags"]),
            "active": providers.get(cfg["provider"], False)
        })
    return {"models": model_list, "providers": providers}
