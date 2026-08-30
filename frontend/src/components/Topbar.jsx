import { NavLink } from "react-router-dom";
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
          <NavLink
            to="/settings"
            className={({ isActive }) => `topbar-icon-btn${isActive ? " active" : ""}`}
            title="System Settings & Operational Controls"
            aria-label="Settings"
          >
            <svg viewBox="0 0 24 24" className="topbar-ico" aria-hidden="true">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.18l-2.39.96a7.3 7.3 0 0 0-1.63-.94L14.45 2.5a.5.5 0 0 0-.5-.34h-3.9a.5.5 0 0 0-.5.34l-.4 2.5c-.56.23-1.1.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.18L2.7 9.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 13.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.18l2.39-.96c.53.4 1.07.71 1.63.94l.4 2.5a.5.5 0 0 0 .5.34h3.9a.5.5 0 0 0 .5-.34l.4-2.5c.56-.23 1.1-.54 1.63-.94l2.39.96a.5.5 0 0 0 .61-.18l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
            </svg>
          </NavLink>
        </div>
      </header>
    </>
  );
}

