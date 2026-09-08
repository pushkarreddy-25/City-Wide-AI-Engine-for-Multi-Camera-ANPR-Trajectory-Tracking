import { NavLink } from "react-router-dom";

const ICON = {
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  violations: "M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z",
  search: "M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z",
  reports: "M5 9.2h3V19H5zM10.6 5h3v14h-3zm5.6 8H19v6h-2.8z",
  upload: "M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z",
  settings: "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.18l-2.39.96a7.3 7.3 0 0 0-1.63-.94L14.45 2.5a.5.5 0 0 0-.5-.34h-3.9a.5.5 0 0 0-.5.34l-.4 2.5c-.56.23-1.1.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.18L2.7 9.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 13.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.18l2.39-.96c.53.4 1.07.71 1.63.94l.4 2.5a.5.5 0 0 0 .5.34h3.9a.5.5 0 0 0 .5-.34l.4-2.5c.56-.23 1.1-.54 1.63-.94l2.39.96a.5.5 0 0 0 .61-.18l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z",
  health: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  incidents: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
  audit: "M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
  ai: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
};

const ITEMS = [
  { to: "/", key: "dashboard", label: "Overview", end: true },
  { to: "/upload", key: "upload", label: "Live ANPR Ingestion" },
  { to: "/search", key: "search", label: "Vehicles & Journeys" },
  { to: "/violations", key: "violations", label: "Real-time Alerts" },
  { to: "/incidents", key: "incidents", label: "Incident Dispatch" },
  { to: "/system-health", key: "health", label: "System Health" },
  { to: "/audit-logs", key: "audit", label: "Security Audit" },
  { to: "/ai-models", key: "ai", label: "AI Model Router" },
  { to: "/reports", key: "reports", label: "Traffic Analytics" },
  { to: "/settings", key: "settings", label: "System Settings" },
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
