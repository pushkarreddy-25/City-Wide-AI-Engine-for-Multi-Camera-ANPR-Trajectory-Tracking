"""Configuration loading utilities.

Loads YAML configuration files from ``backend/config`` and caches them.
Environment variables always take precedence over file values for
deployment-sensitive settings (database URL, cache backend, etc.).
"""
import os
import functools

import yaml

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(BACKEND_DIR, "config")


@functools.lru_cache(maxsize=None)
def load_yaml(name: str) -> dict:
    """Load and cache a YAML config file by filename."""
    path = os.path.join(CONFIG_DIR, name)
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def get_cameras_config() -> dict:
    return load_yaml("cameras.yaml")


def get_anpr_config() -> dict:
    return load_yaml("anpr_config.yaml")


def get_sim_config() -> dict:
    return load_yaml("sim_config.yaml")


def cameras() -> dict:
    """Return the ``{camera_id: {...}}`` mapping."""
    return get_cameras_config().get("cameras", {})


def network_edges() -> list:
    """Return the list of [camera_a, camera_b] road-network edges."""
    return get_cameras_config().get("network", {}).get("edges", [])
