import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from "react-leaflet";
import { api } from "../services/api.js";
import { fmtDateTime, todayISO } from "../services/format.js";

const NAGPUR = [21.1458, 79.0882];

/* HUD palette, repeated because Leaflet paths are SVG attributes rather than
   CSS-styled elements. Green marks where the journey starts, red where it was
   last seen, cyan for every hop between. */
const HOP = { start: "#35d07f", end: "#ff3b47", mid: "#00e5d0", stroke: "#05080d" };

function JourneyMap({ sightings }) {
  const pts = sightings.map((s) => [s.position?.lat, s.position?.lng]).filter((p) => p[0] != null);
  const center = pts.length ? pts[0] : NAGPUR;
  return (
    <MapContainer center={center} zoom={13} className="map map-sm" style={{ height: "100%", width: "100%" }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
      />
      {pts.length > 1 && <Polyline positions={pts} pathOptions={{ color: HOP.mid, weight: 2, opacity: 0.75, dashArray: "5 7" }} />}
      {sightings.map((s, i) => {
        const lat = s.position?.lat, lng = s.position?.lng;
        if (lat == null || lng == null) return null;
        const color = i === 0 ? HOP.start : i === sightings.length - 1 ? HOP.end : HOP.mid;
        return (
          <CircleMarker key={i} center={[lat, lng]} radius={8}
                        pathOptions={{ color: HOP.stroke, weight: 2, fillColor: color, fillOpacity: 1 }}>
            <Popup>
              <div className="popup-cam-name">{i + 1}. {s.camera_name || s.camera_id}</div>
              <div className="popup-row">{fmtDateTime(s.timestamp)}</div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
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
        <div className="search-result">
          <div className="journey-grid">
            <section className="panel">
              <div className="panel-head"><h2 className="eyebrow">Journey path</h2><span className="mono dim">{traj.plate}</span></div>
              <JourneyMap sightings={sightings} />
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2 className="eyebrow">Sightings</h2>
                <span className="mono dim">{sightings.length} sighting{sightings.length === 1 ? "" : "s"}</span>
              </div>
              <ol className="sightings">
                {sightings.map((s, i) => (
                  <li key={i} className="sighting">
                    <div className="sighting-cam">{s.camera_name || s.camera_id}</div>
                    <div className="sighting-meta">{fmtDateTime(s.timestamp)}</div>
                    {s.direction && <div className="sighting-dir">heading {s.direction}</div>}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}
      {msg && <p className="search-msg">{msg}</p>}
    </section>
  );
}
