from __future__ import annotations

from typing import Any, Dict, List

from services import live_service


class PresentationService:
    """Presentation boundary: prepares the dashboard payload from stored state."""

    def publish_vehicle_snapshot(self, vehicle: Dict[str, Any]):
        live_service.publish_vehicle(vehicle)

    def publish_alert(self, alert: Dict[str, Any]):
        live_service.publish_alert(alert)

    def update_congestion(self, snapshot: List[Dict[str, Any]]):
        live_service.set_congestion(snapshot)

    def update_stats(self, stats: Dict[str, Any]):
        live_service.set_stats(stats)

    def stream_snapshot(self):
        return {
            "vehicles": live_service.get_live_vehicles(60),
            "alerts": live_service.get_alerts(10),
            "congestion": live_service.get_congestion(),
            "stats": live_service.get_stats(),
        }
