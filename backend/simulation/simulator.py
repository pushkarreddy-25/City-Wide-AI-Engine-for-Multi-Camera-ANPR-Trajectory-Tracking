"""TrafficSimulator: generates a realistic city-wide traffic stream.

Vehicles are routed along the camera road-network graph. At each camera a
vehicle "dwells" for a few ticks (so the single-camera tracker has something to
link), then transits to the next camera; travel time is derived from real
haversine distance and the vehicle's speed, which keeps cross-camera links
spatially/temporally feasible. Per-visit scenarios (speeding, red-light running,
lane misuse, obscured plates) are drawn at the rates in ``sim_config.yaml``.

The simulator drives the shared :class:`ProcessingPipeline`, so live ticks and
the one-off history seed go through exactly the same ANPR/tracking/violation code.
It runs on a background daemon thread and owns its own DB sessions.
"""
import random
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from db import repository
from db.database import SessionLocal
from db.models import Detection
from linking_module import TrajectoryLinker
from services import live_service
from simulation.fleet import Vehicle, build_fleet
from simulation.pipeline import ProcessingPipeline
from utils.config import cameras as camera_config
from utils.config import get_sim_config, network_edges
from utils.geo import haversine_m

FRAME_W, FRAME_H = 1280, 720


@dataclass
class Trip:
    vehicle: Vehicle
    route: List[str]
    leg: int = 0
    phase: str = "at_camera"           # "at_camera" | "transit"
    dwell: int = 0
    arrive_at: float = 0.0             # sim-seconds when transit completes
    visit: dict = field(default_factory=dict)
    detections: List[dict] = field(default_factory=list)


def _build_graph(edges) -> Dict[str, List[str]]:
    graph: Dict[str, set] = {}
    for a, b in edges:
        graph.setdefault(a, set()).add(b)
        graph.setdefault(b, set()).add(a)
    return {k: sorted(v) for k, v in graph.items()}


class TrafficSimulator:
    def __init__(self, seed: int = 42):
        self.rng = random.Random(seed)
        self.cameras = camera_config()
        self.graph = _build_graph(network_edges())
        cfg = get_sim_config()
        self.sim = cfg.get("simulation", {})
        self.hist = cfg.get("history", {})
        self.vio = cfg.get("violations", {})

        self.fleet = build_fleet(self.rng, self.sim.get("fleet_size", 80))
        self.idle: List[Vehicle] = list(self.fleet)
        self.active: List[Trip] = []

        self.pipeline = ProcessingPipeline(cameras=self.cameras, rng=self.rng)
        self.linker = TrajectoryLinker(self.cameras)

        self.tick_seconds = self.sim.get("tick_seconds", 1.0)
        self.base_dt = datetime.utcnow()
        self.sim_time = 0.0

        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.seeded = False

    # -- routing & scenarios ------------------------------------------------
    def _random_route(self, min_hops: int = 1, max_hops: int = 3) -> List[str]:
        start = self.rng.choice(list(self.cameras.keys()))
        route = [start]
        for _ in range(self.rng.randint(min_hops, max_hops)):
            prev = route[-2] if len(route) > 1 else None
            neighbours = [n for n in self.graph.get(route[-1], []) if n != prev]
            if not neighbours:
                break
            route.append(self.rng.choice(neighbours))
        return route

    def _new_visit(self, camera_id: str) -> dict:
        cam = self.cameras[camera_id]
        limit = cam.get("speed_limit_kmh", 50)

        speeder = self.rng.random() < self.vio.get("speed_violation_probability", 0.09)
        if speeder:
            lo, hi = self.vio.get("speed_over_limit_kmh", [8, 35])
            speed = limit + self.rng.uniform(lo, hi)
        else:
            speed = self.rng.uniform(self.sim.get("min_speed_kmh", 15),
                                     max(self.sim.get("min_speed_kmh", 15) + 1, limit - 3))

        red = self.rng.random() < self.vio.get("red_light_probability", 0.06)
        lane_violation = self.rng.random() < self.vio.get("lane_violation_probability", 0.05)
        obscured = self.rng.random() < self.sim.get("obscured_fraction", 0.18)

        n_lanes = len(cam.get("lanes", [])) + 1
        lane = self.rng.randint(0, max(0, n_lanes - 1))
        visit = {"speed": round(speed, 1), "signal": "red" if red else "green",
                 "lane_violation": lane_violation, "obscured": obscured, "lane": lane}
        visit["bbox"] = self._bbox(camera_id, visit)
        return visit

    def _bbox(self, camera_id: str, visit: dict):
        cam = self.cameras[camera_id]
        lanes = cam.get("lanes", [])
        stop_y = cam.get("stop_line_y", 430)
        xs = [0] + list(lanes) + [FRAME_W]
        li = min(visit["lane"], len(xs) - 2)
        cx = (xs[li] + xs[li + 1]) / 2.0
        w = self.rng.uniform(70, 110)
        h = self.rng.uniform(55, 85)
        if visit["signal"] == "red":       # ran the light -> past the stop line
            y2 = stop_y + self.rng.uniform(10, 40)
        else:
            y2 = stop_y - self.rng.uniform(20, 80)
        return (round(cx - w / 2, 1), round(y2 - h, 1), round(cx + w / 2, 1), round(y2, 1))

    def _ground_truth(self, trip: Trip) -> dict:
        v = trip.visit
        return {
            "plate": trip.vehicle.plate,
            "type": trip.vehicle.type,
            "color": trip.vehicle.color,
            "bbox": v["bbox"],
            "speed_kmh": v["speed"],
            "obscured": v["obscured"],
            "_vid": trip.vehicle.id,
            "context": {"signal_state": v["signal"], "lane_violation": v["lane_violation"]},
        }

    def _travel_seconds(self, a: str, b: str, speed_kmh: float) -> float:
        ca, cb = self.cameras[a], self.cameras[b]
        dist = haversine_m(ca["latitude"], ca["longitude"], cb["latitude"], cb["longitude"])
        return dist / max(3.0, speed_kmh / 3.6)

    # -- live loop ----------------------------------------------------------
    def _spawn(self):
        if not self.idle:
            return
        vehicle = self.idle.pop(self.rng.randrange(len(self.idle)))
        route = self._random_route()
        trip = Trip(vehicle=vehicle, route=route)
        trip.visit = self._new_visit(route[0])
        trip.dwell = self.rng.randint(2, 4)
        self.active.append(trip)

    def tick(self, db):
        self.sim_time += self.tick_seconds
        now = self.base_dt + timedelta(seconds=self.sim_time)

        if len(self.active) < self.sim.get("max_active", 22):
            if self.rng.random() < self.sim.get("spawn_probability", 0.7):
                self._spawn()

        # group vehicles currently in view by camera into frames
        frames: Dict[str, List[Trip]] = {}
        for trip in self.active:
            if trip.phase == "at_camera":
                frames.setdefault(trip.route[trip.leg], []).append(trip)

        for camera_id, trips in frames.items():
            frame = [self._ground_truth(t) for t in trips]
            try:
                from services.runtime_service import runtime_services
            except ImportError:
                runtime_services = None

            if runtime_services is not None and getattr(runtime_services, "started", False):
                runtime_services.emit_frame(camera_id, frame, timestamp=now)
                continue

            dets, _ = self.pipeline.process_frame(db, camera_id, frame, now, publish=True)
            by_vid: Dict[int, List[dict]] = {}
            for d in dets:
                by_vid.setdefault(d["_true_vehicle_id"], []).append(d)
            for trip in trips:
                trip.detections.extend(by_vid.get(trip.vehicle.id, []))

        self._advance(db)
        db.commit()

        active_speeds = [
            trip.visit["speed"]
            for trip in self.active
            if isinstance(trip.visit, dict) and trip.visit.get("speed") is not None
        ]
        avg_city_speed = round(sum(active_speeds) / len(active_speeds), 1) if active_speeds else None

        live_service.set_congestion(repository.congestion_snapshot(db))
        live_service.set_stats({
            "active_vehicles": len(self.active),
            "fleet_size": len(self.fleet),
            "sim_time": _iso(now),
            "avg_city_speed": avg_city_speed,
        })

    def _advance(self, db):
        finished: List[Trip] = []
        for trip in self.active:
            if trip.phase == "at_camera":
                trip.dwell -= 1
                if trip.dwell <= 0:
                    if trip.leg >= len(trip.route) - 1:
                        finished.append(trip)
                    else:
                        nxt = trip.route[trip.leg + 1]
                        travel = self._travel_seconds(trip.route[trip.leg], nxt, trip.visit["speed"])
                        trip.phase = "transit"
                        trip.arrive_at = self.sim_time + travel
            elif self.sim_time >= trip.arrive_at:
                trip.leg += 1
                trip.phase = "at_camera"
                trip.visit = self._new_visit(trip.route[trip.leg])
                trip.dwell = self.rng.randint(2, 4)

        for trip in finished:
            self._complete(trip, db)

    def _complete(self, trip: Trip, db):
        self.active.remove(trip)
        self.idle.append(trip.vehicle)
        if trip.detections:
            for traj in self.linker.link(trip.detections):
                repository.add_trajectory(db, traj)

    # -- history seeding ----------------------------------------------------
    def seed_history(self, db) -> int:
        """Populate the DB with the last N hours of traffic (idempotent)."""
        if not self.hist.get("seed_enabled", True):
            return 0
        if db.query(Detection.detection_id).first() is not None:
            self.seeded = True
            return 0

        hours = self.hist.get("hours", 24)
        per_hour = self.hist.get("vehicles_per_hour", 180)
        total = hours * per_hour
        window_start = self.base_dt - timedelta(hours=hours)

        made = 0
        for i in range(total):
            vehicle = self.rng.choice(self.fleet)
            route = self._random_route()
            cursor = window_start + timedelta(seconds=self.rng.uniform(0, hours * 3600))
            trip_dets: List[dict] = []
            for leg, camera_id in enumerate(route):
                visit = self._new_visit(camera_id)
                trip = Trip(vehicle=vehicle, route=route, leg=leg, visit=visit)
                dets, _ = self.pipeline.process_frame(
                    db, camera_id, [self._ground_truth(trip)], cursor,
                    publish=False, track=False)
                trip_dets.extend(dets)
                if leg < len(route) - 1:
                    travel = self._travel_seconds(camera_id, route[leg + 1], visit["speed"])
                    cursor += timedelta(seconds=travel + self.rng.uniform(2, 6))
            if trip_dets:
                for traj in self.linker.link(trip_dets):
                    repository.add_trajectory(db, traj)
            made += 1
            if made % 200 == 0:
                db.commit()
        db.commit()
        self.seeded = True
        return made

    # -- thread control -----------------------------------------------------
    def run_forever(self):
        db = SessionLocal()
        try:
            try:
                self.seed_history(db)
            except Exception as exc:  # pragma: no cover
                db.rollback()
                print(f"[simulator] history seed failed: {exc}")
            while not self._stop.is_set():
                start = time.time()
                try:
                    self.tick(db)
                except Exception as exc:  # pragma: no cover
                    db.rollback()
                    print(f"[simulator] tick error: {exc}")
                remaining = self.tick_seconds - (time.time() - start)
                if remaining > 0:
                    self._stop.wait(remaining)
        finally:
            db.close()

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self.run_forever, daemon=True, name="traffic-sim")
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)


def _iso(dt):
    return dt.replace(microsecond=0).isoformat() + "Z" if dt else None
