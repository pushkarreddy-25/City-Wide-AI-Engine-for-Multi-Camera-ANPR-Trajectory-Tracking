import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Polyline, Marker } from "react-leaflet";
import L from "leaflet";

function MapResizeObserver() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [map]);
  return null;
}


function densityColor(count) {
  if (count >= 9) return "#dc2626"; // Premium red
  if (count >= 5) return "#d97706"; // Premium amber
  if (count >= 2) return "#0066cc"; // Premium blue
  if (count > 0) return "#16a34a"; // Premium green
  return "#94a3b8"; // slate-400
}

function densityRadius(count) {
  if (!count) return 6;
  return Math.min(22, 9 + count * 2.2);
}

export function LiveMap({ cameras = [], vehicles = [], selectedJourney = null }) {
  const cameraCounts = new Map();
  for (const vehicle of vehicles) {
    const cameraId = vehicle?.camera_id || vehicle?.cameraId;
    if (!cameraId) continue;
    cameraCounts.set(cameraId, (cameraCounts.get(cameraId) || 0) + 1);
  }

  const points = (cameras || [])
    .filter((camera) => camera?.position && Number.isFinite(camera.position.lat) && Number.isFinite(camera.position.lng))
    .map((camera) => {
      const id = camera.id || camera.camera_id;
      const count = cameraCounts.get(id) || 0;
      return {
        id,
        name: camera.name || id,
        lat: camera.position.lat,
        lng: camera.position.lng,
        count,
        level: count >= 9 ? "congested" : count >= 5 ? "moderate" : count > 0 ? "free-flowing" : "idle",
      };
    });

  if (!points.length) {
    return (
      <div className="map-empty">
        <div className="map-empty-card">
          <strong>Camera coverage</strong>
          <span>No camera positions available yet.</span>
        </div>
      </div>
    );
  }

  const center = [points[0].lat, points[0].lng];

  return (
    <MapContainer
      center={center}
      zoom={12.5}
      scrollWheelZoom
      className="live-map"
      style={{ height: "100%", width: "100%", minHeight: "480px" }}
      minZoom={8}
      maxZoom={18}
    >
      <MapResizeObserver />
      <TileLayer
        attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />

      {/* Render camera markers */}
      {points.map((point) => (
        <CircleMarker
          key={point.id}
          center={[point.lat, point.lng]}
          radius={densityRadius(point.count)}
          pathOptions={{
            color: densityColor(point.count),
            fillColor: densityColor(point.count),
            fillOpacity: point.count ? 0.75 : 0.2,
            weight: 2,
          }}
        >
          <Popup>
            <div className="map-popup">
              <div className="map-popup-title" style={{ fontWeight: "700", color: "var(--ink)", marginBottom: "4px" }}>{point.name}</div>
              <div className="map-popup-row" style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", margin: "2px 0" }}>
                <span style={{ color: "var(--ink-dim)" }}>Vehicle density</span>
                <strong style={{ color: "var(--ink)" }}>{point.count}</strong>
              </div>
              <div className="map-popup-row muted" style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", margin: "2px 0" }}>
                <span style={{ color: "var(--ink-dim)" }}>Level</span>
                <strong style={{ textTransform: "capitalize", color: densityColor(point.count) }}>{point.level}</strong>
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {/* Render selected vehicle route trajectory overlay */}
      {selectedJourney && selectedJourney.length > 0 && (
        <>
          <Polyline
            positions={selectedJourney.map(s => [s.position.lat, s.position.lng])}
            pathOptions={{
              color: "#0066cc", // Primary blue path
              weight: 5,
              opacity: 0.9,
            }}
          />
          {selectedJourney.map((s, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === selectedJourney.length - 1;
            const dotColor = isFirst ? "#0066cc" : isLast ? "#dc2626" : "#d97706";
            const size = isFirst ? 14 : 18;
            const icon = L.divIcon({
              className: "journey-dot",
              html: `<div style="background: ${dotColor}; border: 2.5px solid #ffffff; width: ${size}px; height: ${size}px; border-radius: 50%; box-shadow: 0 2px 8px rgba(15,23,42,0.25);"></div>`,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            });
            return (
              <Marker
                key={`j-${idx}`}
                position={[s.position.lat, s.position.lng]}
                icon={icon}
              />
            );
          })}
        </>
      )}
    </MapContainer>
  );
}
