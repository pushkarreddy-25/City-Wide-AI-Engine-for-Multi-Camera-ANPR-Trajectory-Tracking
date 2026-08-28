"""The simulated vehicle fleet.

A fleet is a fixed pool of vehicles (plate + type + colour). The simulator draws
from this pool so the same vehicle recurs across cameras and over the day, which
is what makes cross-camera linking and historical search meaningful.
"""
import random
from dataclasses import dataclass
from typing import List

from anpr_module.attributes import COLORS
from utils.plate import generate_plate

# (type, weight) — weighted toward cars and two-wheelers, as on Indian roads.
VEHICLE_TYPES = [
    ("Car", 0.46), ("Motorcycle", 0.30), ("Auto", 0.10),
    ("Truck", 0.08), ("Bus", 0.06),
]


@dataclass
class Vehicle:
    id: int
    plate: str
    type: str
    color: str


def _weighted_choice(rng: random.Random, pairs):
    r = rng.random()
    acc = 0.0
    for value, weight in pairs:
        acc += weight
        if r <= acc:
            return value
    return pairs[-1][0]


def build_fleet(rng: random.Random, size: int) -> List[Vehicle]:
    seen = set()
    fleet: List[Vehicle] = []
    for i in range(size):
        plate = generate_plate(rng)
        while plate in seen:
            plate = generate_plate(rng)
        seen.add(plate)
        fleet.append(Vehicle(
            id=i,
            plate=plate,
            type=_weighted_choice(rng, VEHICLE_TYPES),
            color=rng.choice(COLORS),
        ))
    return fleet
