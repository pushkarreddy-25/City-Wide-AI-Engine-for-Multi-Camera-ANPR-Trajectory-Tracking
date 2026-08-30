import { useMemo } from "react";
import { LiveMap } from "../components/LiveMap.jsx";
import { PlateChip, Severity } from "../components/PlateChip.jsx";
import { congestionIndex, fmtTime, prettyType } from "../services/format.js";

function StatCard({ id, eyebrow, value, children }) {
  return (
    <article className="stat" id={id}>
      <span className="stat-eyebrow">{eyebrow}</span>
      <span className="stat-num mono">{value}</span>
      <span className="stat-sub">{children}</span>
    </article>
  );
}

export function Dashboard({ cameras, snapshot, feed, openModal }) {
  const { vehicles = [], congestion = [], stats = {} } = snapshot;

  const avgSpeed = useMemo(() => {
    const s = vehicles.map((v) => v.speed_kmh).filter((x) => typeof x === "number");
    return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : "—";
  }, [vehicles]);

  const cong = useMemo(() => congestionIndex(congestion), [congestion]);
  const open = useMemo(() => feed.filter((v) => !v.resolved), [feed]);
  const highCount = open.filter((v) => v.severity === "high").length;
  const vehiclesInView = stats.active_vehicles ?? vehicles.length;
  const lowConfidenceCount = open.filter((v) => typeof v.confidence === "number" && v.confidence < 0.65).length;
  const lowConfidenceAlert = open.length > 0 && (lowConfidenceCount / open.length) > 0.4;

  return (
    <section className="view view-dashboard">
      {lowConfidenceAlert && (
        <div className="alert-banner" role="alert">
          Low-light or poor-condition plate reads detected: {Math.round((lowConfidenceCount / open.length) * 100)}% of active plates are below 0.65 confidence.
        </div>
      )}
      <div className="stat-strip">
        <StatCard id="stat-vehicles" eyebrow="In view now" value={vehiclesInView}>
          vehicles across {cameras.length || 5} cameras
        </StatCard>
        <StatCard id="stat-congestion" eyebrow="Congestion index" value={cong.index ?? "—"}>
          <span className="pill" data-level={cong.level}>{cong.label}</span>
        </StatCard>
        <StatCard id="stat-violations" eyebrow="Active violations" value={open.length}>
          <span className="sev-high mono">{highCount} high</span> · recent
        </StatCard>
        <StatCard id="stat-speed" eyebrow="Avg city speed" value={avgSpeed}>
          km/h · live mean
        </StatCard>
      </div>

      <div className="dash-grid">
        <section className="panel panel-map">
          <div className="panel-head">
            <h2 className="eyebrow">Camera density</h2>
            <span className="feed-count mono">{vehicles.length} active</span>
          </div>
          <LiveMap cameras={cameras} vehicles={vehicles} />
        </section>

        <section className="panel panel-feed">
          <div className="panel-head">
            <h2 className="eyebrow">Live violation feed</h2>
            <span className="feed-count mono">{open.length}</span>
          </div>
          <ul className="feed" aria-live="polite">
            {feed.length === 0 && <li className="feed-empty">Waiting for the engine to surface violations…</li>}
            {feed.map((v) => (
              <li key={v.violation_id} className="feed-item" data-sev={v.severity || "low"} onClick={() => openModal(v)}>
                <div className="feed-top">
                  <span className="feed-type">{prettyType(v.type)}</span>
                  <span className="feed-time">{fmtTime(v.timestamp)}</span>
                </div>
                <div className="feed-mid">
                  <PlateChip plate={v.plate} confidence={v.confidence} />
                  <Severity level={v.severity} />
                </div>
                <div className="feed-cam">{v.camera_name || v.camera_id || ""}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
