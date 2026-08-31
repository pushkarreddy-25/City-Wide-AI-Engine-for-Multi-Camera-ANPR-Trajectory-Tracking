import { NavLink } from "react-router-dom";

const ICON = {
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  violations: "M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z",
  search: "M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z",
  reports: "M5 9.2h3V19H5zM10.6 5h3v14h-3zm5.6 8H19v6h-2.8z",
  upload: "M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z",
  settings: "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.18l-2.39.96a7.3 7.3 0 0 0-1.63-.94L14.45 2.5a.5.5 0 0 0-.5-.34h-3.9a.5.5 0 0 0-.5.34l-.4 2.5c-.56.23-1.1.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.18L2.7 9.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 13.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.18l2.39-.96c.53.4 1.07.71 1.63.94l.4 2.5a.5.5 0 0 0 .5.34h3.9a.5.5 0 0 0 .5-.34l.4-2.5c.56-.23 1.1-.54 1.63-.94l2.39.96a.5.5 0 0 0 .61-.18l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z",
};

const ITEMS = [
  { to: "/", key: "dashboard", label: "Dashboard", end: true },
  { to: "/violations", key: "violations", label: "Violations" },
  { to: "/search", key: "search", label: "Search" },
  { to: "/reports", key: "reports", label: "Reports" },
  { to: "/upload", key: "upload", label: "Video Ingestion" },
  { to: "/settings", key: "settings", label: "Settings" },
];

export function Sidebar({ openViolations = 0 }) {
  return (
    <nav className="sidebar" aria-label="Primary">
      {ITEMS.map((it) => (
        <NavLink
          key={it.key}
          to={it.to}
          end={it.end}
          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
        >
          <svg viewBox="0 0 24 24" className="nav-ico"><path d={ICON[it.key]} /></svg>
          <span>{it.label}</span>
          {it.key === "violations" && openViolations > 0 && <em className="nav-badge">{openViolations}</em>}
        </NavLink>
      ))}
      <div className="sidebar-foot">
        <div className="legend">
          <span className="legend-row"><i className="dot ok" />Free-flowing</span>
          <span className="legend-row"><i className="dot warn" />Moderate</span>
          <span className="legend-row"><i className="dot bad" />Congested</span>
        </div>
      </div>
    </nav>
  );
}
