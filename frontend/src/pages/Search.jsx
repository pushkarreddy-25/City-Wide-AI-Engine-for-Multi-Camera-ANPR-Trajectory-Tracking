import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { api } from "../services/api.js";
import { fmtDateTime, prettyType, todayISO } from "../services/format.js";

/* ──────────────────────────────────────────────
   Plate normalisation — strip separators, uppercase
────────────────────────────────────────────── */
function normalisePlate(raw) {
  return raw.replace(/[\s\-]/g, "").toUpperCase();
}

/* ──────────────────────────────────────────────
   Haversine distance between two {lat,lng} points (km)
────────────────────────────────────────────── */
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ──────────────────────────────────────────────
   Map auto-fit helper
────────────────────────────────────────────── */
function FitBounds({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length >= 2) {
      map.fitBounds(coords, { padding: [40, 40] });
    } else if (coords.length === 1) {
      map.setView(coords[0], 14);
    }
  }, [map, coords]);
  return null;
}

/* ──────────────────────────────────────────────
   Map Resize Observer helper to solve container sizing issues
────────────────────────────────────────────── */
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

const VIO_COLOR = {
  red_light: "#ff3b47",
  over_speed: "#ffb020",
  speeding: "#ffb020",
  wrong_lane: "#00e5d0",
};

/* ──────────────────────────────────────────────
   Journey Map
────────────────────────────────────────────── */
function JourneyMap({ sightings = [], violations = [] }) {
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
          speed: s.speed_kmh,
          index,
        })),
    [sightings],
  );

  const vioMap = useMemo(() => {
    const m = {};
    violations.forEach((v) => {
      if (!m[v.camera_id]) m[v.camera_id] = [];
      m[v.camera_id].push(v);
    });
    return m;
  }, [violations]);

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
      <MapContainer
        center={[points[0].lat, points[0].lng]}
        zoom={13}
        scrollWheelZoom
        className="journey-map-inner"
        style={{ height: "100%", width: "100%", minHeight: "500px" }}
        minZoom={7}
        maxZoom={18}
      >
        <FitBounds coords={coords} />
        <MapResizeObserver />
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <Polyline
          positions={coords}
          pathOptions={{
            color: "#3b82f6",
            weight: 6,
            opacity: 0.9,
            className: "journey-route-line"
          }}
        />
        {points.map((point) => {
          const pointVios = vioMap[point.camera_id] || [];
          const hasVio = pointVios.length > 0;
          
          const isFirst = point.index === 0;
          const isLast = point.index === points.length - 1;
          
          // Color coding matching the user's screenshot:
          // Start point = Blue, End point = Red, Intermediate points = Orange
          const markerColor = isFirst
            ? "#3b82f6" // Blue
            : isLast
            ? "#ef4444" // Red
            : "#f97316"; // Orange
            
          // Start dot is slightly smaller in the screenshot (e.g. 18px), others are 24px
          const size = isFirst ? 18 : 24;

          const icon = L.divIcon({
            className: `journey-marker${hasVio ? " journey-marker--vio" : ""}`,
            html: `<div class="journey-marker-inner" style="background: ${markerColor}; border: 3px solid #ffffff !important; box-shadow: 0 2px 8px rgba(0,0,0,0.35); width: ${size}px; height: ${size}px; border-radius: 50%;"></div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });

          return (
            <Marker
              key={point.id}
              position={[point.lat, point.lng]}
              icon={icon}
            >
              <Popup maxWidth={220}>
                <div className="map-popup">
                  <div className="map-popup-title">
                    <span className="stop-badge">#{point.index + 1}</span> {point.name}
                  </div>
                  <div className="map-popup-row">
                    <span>Time</span>
                    <strong>{fmtDateTime(point.time)}</strong>
                  </div>
                  {point.speed != null && (
                    <div className="map-popup-row">
                      <span>Speed</span>
                      <strong>{point.speed} km/h</strong>
                    </div>
                  )}
                  {point.direction && (
                    <div className="map-popup-row muted">
                      <span>Heading</span>
                      <strong>{point.direction}</strong>
                    </div>
                  )}
                  {hasVio && (
                    <div className="map-popup-row" style={{ color: markerColor, marginTop: 6 }}>
                      <span>Violation</span>
                      <strong>{prettyType(pointVios[0]?.type)}</strong>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Plate suggestion dropdown
────────────────────────────────────────────── */
function Suggestions({ plate, onSelect }) {
  const [items, setItems] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (plate.length < 3) { setItems([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.searchJourneys(plate, { limit: 8 });
        setItems(res.results || []);
      } catch { setItems([]); }
    }, 350);
    return () => clearTimeout(timerRef.current);
  }, [plate]);

  if (!items.length) return null;

  return (
    <ul className="plate-suggestions">
      {items.map((it) => (
        <li key={`${it.plate}-${it.date}`} className="plate-suggestion-item"
            onClick={() => { onSelect(it.plate); setItems([]); }}>
          <span className="mono">{it.plate}</span>
          <span className="dim">{it.date} · {it.sighting_count} stop{it.sighting_count !== 1 ? "s" : ""}</span>
        </li>
      ))}
    </ul>
  );
}

/* ──────────────────────────────────────────────
   Journey KPI summary bar
────────────────────────────────────────────── */
function JourneySummary({ traj, violations }) {
  const stats = useMemo(() => {
    const sightings = traj.sightings || [];
    const geo = sightings.filter(
      (s) => s?.position && Number.isFinite(s.position.lat) && Number.isFinite(s.position.lng),
    );
    let distKm = 0;
    for (let i = 1; i < geo.length; i++) distKm += haversineKm(geo[i - 1].position, geo[i].position);

    const times = sightings.map((s) => s.timestamp && new Date(s.timestamp)).filter(Boolean);
    const durationMs = times.length >= 2 ? Math.max(...times) - Math.min(...times) : 0;
    const durationMin = Math.round(durationMs / 60000);

    const speeds = sightings.map((s) => s.speed_kmh).filter((x) => typeof x === "number" && x > 0);
    const avgSpeed = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;

    return { stops: sightings.length, distKm: distKm.toFixed(1), durationMin, avgSpeed };
  }, [traj]);

  return (
    <div className="journey-kpi-row">
      <div className="journey-kpi">
        <span className="journey-kpi-val">{stats.stops}</span>
        <span className="journey-kpi-lbl">Camera stops</span>
      </div>
      <div className="journey-kpi">
        <span className="journey-kpi-val">{stats.distKm} km</span>
        <span className="journey-kpi-lbl">Est. distance</span>
      </div>
      <div className="journey-kpi">
        <span className="journey-kpi-val">{stats.durationMin > 0 ? `${stats.durationMin}m` : "—"}</span>
        <span className="journey-kpi-lbl">Trip duration</span>
      </div>
      {stats.avgSpeed != null && (
        <div className="journey-kpi">
          <span className="journey-kpi-val">{stats.avgSpeed} km/h</span>
          <span className="journey-kpi-lbl">Avg speed</span>
        </div>
      )}
      {violations.length > 0 && (
        <div className="journey-kpi journey-kpi--vio">
          <span className="journey-kpi-val">{violations.length}</span>
          <span className="journey-kpi-lbl">Violation{violations.length !== 1 ? "s" : ""}</span>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Visual vertical timeline
────────────────────────────────────────────── */
function Timeline({ sightings, violations }) {
  const vioMap = useMemo(() => {
    const m = {};
    violations.forEach((v) => {
      if (!m[v.camera_id]) m[v.camera_id] = [];
      m[v.camera_id].push(v);
    });
    return m;
  }, [violations]);

  return (
    <ol className="journey-timeline">
      {sightings.map((s, i) => {
        const camVios = vioMap[s.camera_id] || [];
        const isLast = i === sightings.length - 1;
        return (
          <li key={`${s.camera_id || "cam"}-${i}`} className={`tl-item${camVios.length ? " tl-item--vio" : ""}`}>
            <div className="tl-node">
              <span className="tl-number">{i + 1}</span>
              {!isLast && <span className="tl-line" />}
            </div>
            <div className="tl-body">
              <div className="tl-cam">{s.camera_name || s.camera_id}</div>
              <div className="tl-meta">
                <span>{fmtDateTime(s.timestamp)}</span>
                {s.speed_kmh != null && <span className="tl-speed">{s.speed_kmh} km/h</span>}
                {s.direction && <span className="tl-dir dim">{s.direction}</span>}
              </div>
              {camVios.map((v, vi) => (
                <span key={vi} className="tl-vio-pill" data-vtype={v.type}>
                  ⚠ {prettyType(v.type)}
                  {v.speed_kmh != null && ` · ${v.speed_kmh} km/h`}
                </span>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ──────────────────────────────────────────────
   Camera list hook
────────────────────────────────────────────── */
function useCameras() {
  const [cams, setCams] = useState([]);
  useEffect(() => {
    api.cameras().then(setCams).catch(() => setCams([]));
  }, []);
  return cams;
}

/* ──────────────────────────────────────────────
   Main Search page
────────────────────────────────────────────── */
export function Search() {
  const [plate, setPlate]           = useState("");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState(todayISO());
  const [cameraId, setCameraId]     = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [color, setColor]           = useState("");
  const [traj, setTraj]             = useState(null);
  const [violations, setViolations] = useState([]);
  const [isApprox, setIsApprox]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [msg, setMsg]               = useState(null);
  const cameras                     = useCameras();

  const submit = useCallback(async (e) => {
    e.preventDefault();
    const p = normalisePlate(plate.trim());
    if (!p) { setMsg("Enter a license plate to search."); setTraj(null); return; }
    setMsg(null); setTraj(null); setLoading(true);
    try {
      const t = await api.journey(p, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        cameraId: cameraId || undefined,
        vehicleType: vehicleType || undefined,
        color: color || undefined,
      });
      setTraj(t);
      setViolations(t.violations || []);
      setIsApprox(!!t.is_approximate);
    } catch (err) {
      setTraj(null);
      setMsg(
        err.status === 404
          ? `No journey or detections found for "${plate.trim()}"${dateTo ? " up to " + dateTo : ""}.`
          : `Search failed — ${err.message}.`,
      );
    } finally {
      setLoading(false);
    }
  }, [plate, dateFrom, dateTo, cameraId, vehicleType, color]);

  const sightings = traj?.sightings || [];

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Search vehicle journey</h1>
          <p className="view-desc">Reconstruct where a plate has been, stitched across every camera that saw it.</p>
        </div>
      </div>

      <form className="search-bar search-bar--advanced" onSubmit={submit}>
        <div className="search-row">
          <label className="field grow search-plate-wrap">
            <span>License plate</span>
            <div className="plate-input-wrap">
              <input
                id="journey-plate-input"
                className="mono"
                placeholder="MH-31-AB-1234 or partial…"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
              />
              <Suggestions plate={normalisePlate(plate)} onSelect={(p) => setPlate(p)} />
            </div>
          </label>

          <label className="field">
            <span>From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>

          <label className="field">
            <span>To</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>

          <label className="field">
            <span>Camera</span>
            <select value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
              <option value="">All cameras</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.id}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Type</span>
            <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              <option value="">Any type</option>
              <option value="Car">Car</option>
              <option value="Truck">Truck</option>
              <option value="Bus">Bus</option>
              <option value="Motorcycle">Motorcycle</option>
              <option value="Auto">Auto</option>
            </select>
          </label>

          <label className="field">
            <span>Colour</span>
            <select value={color} onChange={(e) => setColor(e.target.value)}>
              <option value="">Any colour</option>
              <option value="White">White</option>
              <option value="Black">Black</option>
              <option value="Silver">Silver</option>
              <option value="Red">Red</option>
              <option value="Blue">Blue</option>
              <option value="Gray">Gray</option>
              <option value="Yellow">Yellow</option>
              <option value="Green">Green</option>
            </select>
          </label>

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Searching\u2026" : "Search journey"}
          </button>
        </div>
      </form>

      {traj && isApprox && (
        <div className="alert-banner" style={{ marginTop: "var(--gap)" }}>
          <span>⚠</span>
          <span>
            <strong>Approximate journey</strong> — reconstructed from individual camera detections. No linked
            trajectory found; sightings are deduplicated per camera per hour.
          </span>
        </div>
      )}

      {traj && (
        <>
          <JourneySummary traj={traj} violations={violations} />
          <div className="journey-grid">
            <section className="panel panel-journey-map">
              <div className="panel-head">
                <h2 className="eyebrow">Journey map</h2>
                <span className="mono dim">{traj.plate}</span>
              </div>
              <JourneyMap sightings={sightings} violations={violations} />
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2 className="eyebrow">Timeline</h2>
                <span className="mono dim">{sightings.length} stop{sightings.length !== 1 ? "s" : ""}</span>
              </div>
              <Timeline sightings={sightings} violations={violations} />
            </section>
          </div>
        </>
      )}

      {msg && <p className="search-msg">{msg}</p>}
    </section>
  );
}

