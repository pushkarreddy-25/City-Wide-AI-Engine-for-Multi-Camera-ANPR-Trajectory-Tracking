"""WebSocket endpoint pushing the live dashboard state every few seconds."""
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api.security import origin_is_same_site, ws_connections
from services import live_service

router = APIRouter(tags=["realtime"])

log = logging.getLogger(__name__)

PUSH_INTERVAL_S = 2.0

# Close codes (RFC 6455 / IANA): 1008 policy violation, 1013 try again later.
CLOSE_POLICY = 1008
CLOSE_OVERLOADED = 1013


def _dedupe(vehicles):
    seen, out = set(), []
    for v in vehicles:
        tid = v.get("track_id")
        if tid in seen:
            continue
        seen.add(tid)
        out.append(v)
    return out


@router.websocket("/ws/vehicles")
async def ws_vehicles(websocket: WebSocket):
    """Stream the dashboard snapshot.

    Two guards before ``accept()``. WebSocket handshakes bypass CORS entirely,
    so the browser will let *any* page open this socket — the origin check is
    the equivalent protection, applied by hand. The connection ceiling matters
    because each socket owns a task pushing a full snapshot every two seconds
    and the app deliberately runs a single worker.
    """
    if not origin_is_same_site(websocket.headers.get("origin"),
                               websocket.headers.get("host")):
        await websocket.close(code=CLOSE_POLICY)
        return

    if not ws_connections.acquire():
        await websocket.close(code=CLOSE_OVERLOADED)
        return

    try:
        # accept() belongs inside the try: if the handshake dies here (client
        # gone, proxy timeout) the slot still has to be handed back, or enough
        # failed handshakes silently exhaust the ceiling and lock everyone out.
        await websocket.accept()
        while True:
            await websocket.send_json({
                "vehicles": _dedupe(live_service.get_live_vehicles(60)),
                "alerts": live_service.get_alerts(10),
                "congestion": live_service.get_congestion(),
                "stats": live_service.get_stats(),
            })
            await asyncio.sleep(PUSH_INTERVAL_S)
    except WebSocketDisconnect:
        return
    except Exception:
        # Log rather than swallow: a silent `pass` here once hid a broken feed.
        log.warning("WebSocket push failed; closing", exc_info=True)
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        ws_connections.release()
