import { useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import { api } from "../services/api.js";
import { fmtDateTime, todayISO } from "../services/format.js";

function JourneyMap({ sightings = [] }) {
  const points = useMemo(
    () =>
      sightings
        .filter((s) => s?.position && Number.isFinite(s.position.lat) && Number.isFinite(s.position.lng))
        .map((s, index) => ({
          id: `${s.camera_id || "camera"}-${index}`,
          name: s.camera_name || s.camera_id || `Camera ${index + 1}`,
          lat: s.position.lat,
          lng: s.position.lng,
          direction: s.direction,
          time: s.timestamp,
          index,
        })),
    [sightings],
  );

  if (!points.length) {
    return (
      <div className="map-empty">
        <div className="map-empty-card">
          <strong>Journey map</strong>
          <span>No geographic sightings available for this trip.</span>
        </div>
      </div>
    );
  }

  const coords = points.map((p) => [p.lat, p.lng]);

  return (
    <div className="journey-map">
      <MapContainer bounds={coords.length > 1 ? coords : [[points[0].lat, points[0].lng]]} scrollWheelZoom className="journey-map-inner" zoom={13} minZoom={7} maxZoom={18}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Polyline positions={coords} pathOptions={{ color: "#00e5d0", weight: 4, opacity: 0.9 }} />

        {points.map((point) => (
          <CircleMarker
            key={point.id}
            center={[point.lat, point.lng]}
            radius={7}
            pathOptions={{
              color: "#0ea5e9",
              fillColor: "#00e5d0",
              fillOpacity: 0.95,
              weight: 2,
            }}
          >
            <Popup>
              <div className="map-popup">
                <div className="map-popup-title">{point.name}</div>
                <div className="map-popup-row">
                  <span>Stop</span>
                  <strong>{point.index + 1}</strong>
                </div>
                {point.direction && (
                  <div className="map-popup-row muted">
                    <span>Heading</span>
                    <strong>{point.direction}</strong>
                  </div>
                )}
                <div className="map-popup-row muted">
                  <span>Time</span>
                  <strong>{fmtDateTime(point.time)}</strong>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

export function Search() {
  const [plate, setPlate] = useState("");
  const [date, setDate] = useState(todayISO());
  const [traj, setTraj] = useState(null);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const p = plate.trim();
    if (!p) { setMsg("Enter a license plate to search."); setTraj(null); return; }
    setMsg("Searching…"); setTraj(null);
    try {
      const t = await api.journey(p, date);
      setTraj(t); setMsg(null);
    } catch (err) {
      setTraj(null);
      setMsg(err.status === 404 ? `No journey found for ${p}${date ? " on " + date : ""}.` : `Search failed (${err.message}).`);
    }
  }

  const sightings = traj?.sightings || [];

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Search vehicle journey</h1>
          <p className="view-desc">Reconstruct where a plate has been, stitched across every camera that saw it.</p>
        </div>
      </div>

      <form className="search-bar" onSubmit={submit}>
        <label className="field grow">
          <span>License plate</span>
          <input className="mono" placeholder="MH-31-AB-1234" value={plate}
                 onChange={(e) => setPlate(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn btn-primary" type="submit">Search journey</button>
      </form>

      {traj && (
        <div className="journey-grid">
          <section className="panel">
            <div className="panel-head">
              <h2 className="eyebrow">Journey map</h2>
              <span className="mono dim">{traj.plate}</span>
            </div>
            <JourneyMap sightings={sightings} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="eyebrow">Sightings</h2>
              <span className="mono dim">{sightings.length} stops</span>
            </div>
            <ol className="sightings">
              {sightings.map((s, i) => (
                <li key={`${s.camera_id || "camera"}-${i}`} className="sighting">
                  <div className="sighting-cam">{s.camera_name || s.camera_id}</div>
                  <div className="sighting-meta">{fmtDateTime(s.timestamp)}</div>
                  {s.direction && <div className="sighting-dir">heading {s.direction}</div>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
      {msg && <p className="search-msg">{msg}</p>}
    </section>
  );
}
