import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

const NAGPUR = [21.1458, 79.0882];

const LEVELS = new Set(["low", "medium", "high"]);
/** Clamp a congestion level to the three values the stylesheet knows. */
const level = (v) => (LEVELS.has(v) ? v : "low");
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function camIcon(count, lvl) {
  const n = Math.max(0, Math.round(num(count)));
  const size = Math.max(30, Math.min(52, 30 + n * 1.6));
  return L.divIcon({
    className: "",
    html: `<div class="cam-node" data-level="${level(lvl)}" style="width:${size}px;height:${size}px">
             <div class="cam-ring"><span class="cam-count">${n}</span></div>
           </div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}

/* Leaflet's bindPopup takes an element as happily as an HTML string, so camera
   names go in as text nodes. That removes the injection surface rather than
   escaping it — worth doing here because camera metadata arrives from the API,
   not from this file. */
function camPopup(c) {
  const wrap = document.createElement("div");
  const name = document.createElement("div");
  name.className = "popup-cam-name";
  name.textContent = c.name ?? c.id ?? "Camera";
  const meta = document.createElement("div");
  meta.className = "popup-row";
  meta.textContent =
    `Speed limit ${c.speed_limit_kmh ?? "—"} km/h · ${c.lanes?.length ?? c.lanes ?? "—"} lanes`;
  wrap.append(name, meta);
  return wrap;
}

// Imperatively manage camera + vehicle layers so 2s snapshots don't thrash React.
function MapLayers({ cameras, congestion, vehicles, showVehicles }) {
  const map = useMap();
  const camLayer = useRef(null);
  const vehLayer = useRef(null);
  const markers = useRef({});

  useEffect(() => {
    camLayer.current = L.layerGroup().addTo(map);
    vehLayer.current = L.layerGroup().addTo(map);
    return () => { camLayer.current?.remove(); vehLayer.current?.remove(); };
  }, [map]);

  // build camera markers once cameras arrive
  useEffect(() => {
    if (!camLayer.current || !cameras.length) return;

    const nextMarkers = {};
    const pts = [];
    cameras.forEach((c) => {
      const lat = c.position?.lat, lng = c.position?.lng;
      if (lat == null || lng == null) return;
      pts.push([lat, lng]);
      const key = c.id ?? c.camera_id;
      const existing = markers.current[key];
      const marker = existing ?? L.marker([lat, lng], { icon: camIcon(0, "low") });
      marker.setLatLng([lat, lng]);
      marker.setIcon(camIcon(0, "low"));
      if (!existing) {
        marker.bindPopup(camPopup(c)).addTo(camLayer.current);
      }
      nextMarkers[key] = marker;
    });

    Object.keys(markers.current).forEach((key) => {
      if (!nextMarkers[key]) {
        markers.current[key].remove();
      }
    });
    markers.current = nextMarkers;

    if (pts.length) {
      map.fitBounds(pts, { padding: [50, 50], maxZoom: 13 });
    }
  }, [cameras, map]);

  // recolour camera markers on congestion updates
  useEffect(() => {
    const byId = {};
    (congestion || []).forEach((c) => { byId[c.camera_id] = c; });
    Object.entries(markers.current).forEach(([id, marker]) => {
      const cell = byId[id];
      marker.setIcon(camIcon(cell?.vehicle_count, cell?.level));
    });
  }, [congestion, map]);

  // vehicle activity dots (jittered around each camera)
  useEffect(() => {
    if (!vehLayer.current) return;
    vehLayer.current.clearLayers();
    if (!showVehicles) return;

    const items = (vehicles || []).slice(0, 120);
    items.forEach((v) => {
      const lat = v.position?.lat, lng = v.position?.lng;
      if (lat == null || lng == null) return;
      const j = 0.0016;
      L.marker([lat + (Math.random() - 0.5) * j, lng + (Math.random() - 0.5) * j], {
        icon: L.divIcon({ className: "", html: `<div class="veh-dot"></div>`, iconSize: [8, 8], iconAnchor: [4, 4] }),
        interactive: false,
      }).addTo(vehLayer.current);
    });
  }, [vehicles, showVehicles]);

  return null;
}

export function LiveMap({ cameras = [], congestion = [], vehicles = [], showVehicles = true }) {
  return (
    <MapContainer center={NAGPUR} zoom={13} className="map" zoomControl style={{ height: "100%", width: "100%" }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
      />
      <MapLayers cameras={cameras} congestion={congestion} vehicles={vehicles} showVehicles={showVehicles} />
    </MapContainer>
  );
}
