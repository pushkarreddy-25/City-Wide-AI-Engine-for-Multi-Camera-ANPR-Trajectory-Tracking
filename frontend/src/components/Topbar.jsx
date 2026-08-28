import { fmtTime } from "../services/format.js";

const STATUS_LABEL = { live: "live", connecting: "connecting", down: "reconnecting" };

export function Topbar({ status, stats }) {
  return (
    <>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">ANPR<span className="brand-sep">·</span><b>Traffic Intelligence</b></span>
      </div>

      <header className="topbar">
        <div className="topbar-meta">
          <div className="meta-item">
            <span className="meta-label">City</span>
            <span className="meta-val">Nagpur</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Sim clock</span>
            <span className="meta-val mono">{stats?.sim_time ? fmtTime(stats.sim_time) : "--:--:--"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Fleet</span>
            <span className="meta-val mono">{stats?.fleet_size ?? "—"}</span>
          </div>
          <div className="conn" data-state={status}>
            <span className="conn-dot" />
            <span>{STATUS_LABEL[status] || status}</span>
          </div>
        </div>
      </header>
    </>
  );
}
