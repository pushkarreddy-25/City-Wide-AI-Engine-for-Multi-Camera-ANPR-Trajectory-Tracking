import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";

function densityColor(count) {
  if (count >= 9) return "#ff3b47";
  if (count >= 5) return "#ffb020";
  if (count >= 2) return "#00a8a8";
  if (count > 0) return "#35d07f";
  return "#9aa8b3";
}

function densityRadius(count) {
  if (!count) return 6;
  return Math.min(20, 8 + count * 2.5);
}

export function LiveMap({ cameras = [], vehicles = [] }) {
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
        level: count >= 9 ? "high" : count >= 5 ? "medium" : count > 0 ? "low" : "idle",
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
    <MapContainer center={center} zoom={12} scrollWheelZoom className="live-map" minZoom={8} maxZoom={18}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {points.map((point) => (
        <CircleMarker
          key={point.id}
          center={[point.lat, point.lng]}
          radius={densityRadius(point.count)}
          pathOptions={{
            color: densityColor(point.count),
            fillColor: densityColor(point.count),
            fillOpacity: point.count ? 0.8 : 0.35,
            weight: 1.5,
          }}
        >
          <Popup>
            <div className="map-popup">
              <div className="map-popup-title">{point.name}</div>
              <div className="map-popup-row">
                <span>Vehicle density</span>
                <strong>{point.count}</strong>
              </div>
              <div className="map-popup-row muted">
                <span>Level</span>
                <strong>{point.level}</strong>
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
