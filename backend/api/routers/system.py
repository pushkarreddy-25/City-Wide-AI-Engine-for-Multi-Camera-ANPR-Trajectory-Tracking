from pydantic import BaseModel
from fastapi import APIRouter
import yaml
import os

router = APIRouter(prefix="/system", tags=["system"])

class ModeUpdate(BaseModel):
    mode: str

@router.get("/mode")
def get_mode():
    config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "config", "anpr_config.yaml")
    try:
        with open(config_path, "r") as f:
            cfg = yaml.safe_load(f)
        is_simulation = cfg.get("detection", {}).get("engine") == "mock"
        return {"mode": "simulation" if is_simulation else "production"}
    except Exception as e:
        return {"mode": "unknown", "error": str(e)}

@router.post("/mode")
def set_mode(payload: ModeUpdate):
    # This must be imported lazily to avoid circular imports during startup
    import api.main as main_app
    from services.runtime_service import runtime_services
    
    mode = payload.mode.lower()
    config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "config", "anpr_config.yaml")
    
    with open(config_path, "r") as f:
        cfg = yaml.safe_load(f)
        
    if mode == "simulation":
        cfg.setdefault("detection", {})["engine"] = "mock"
        cfg.setdefault("ocr", {})["engine"] = "mock"
        cfg.setdefault("attributes", {})["engine"] = "mock"
    else:
        cfg.setdefault("detection", {})["engine"] = "yolo"
        cfg.setdefault("ocr", {})["engine"] = "easyocr"
        cfg.setdefault("attributes", {})["engine"] = "histogram"
        
    with open(config_path, "w") as f:
        yaml.safe_dump(cfg, f)
        
    # Apply to running instances
    # We rebuild the global pipeline with the new config
    import anpr_module.engine
    from utils.config import get_anpr_config
    import importlib
    
    # Reload config parsing
    importlib.reload(anpr_module.engine)
    
    # Reload runtime services pipeline
    if hasattr(runtime_services, 'pipeline'):
        # Just creating a new engine loads the new config from file
        new_engine = anpr_module.engine.ANPREngine()
        runtime_services.pipeline.engine = new_engine
        
    # Start or stop simulator
    if mode == "simulation":
        if hasattr(main_app, 'simulator') and main_app.simulator is not None:
            main_app.simulator.start()
    else:
        if hasattr(main_app, 'simulator') and main_app.simulator is not None:
            main_app.simulator.stop()
            
    return {"status": "ok", "mode": mode}
