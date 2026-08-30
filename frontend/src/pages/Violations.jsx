import { useCallback, useEffect, useState } from "react";
import { api, exportUrls } from "../services/api.js";
import { fmtDateTime, prettyType, detailLine } from "../services/format.js";
import { PlateChip, Severity } from "../components/PlateChip.jsx";

export function Violations({ openModal }) {
  const [rows, setRows] = useState(null); // null = loading
  const [filters, setFilters] = useState({ type: "", severity: "", resolved: "" });

  const load = useCallback(async () => {
    setRows(null);
    try {
      const params = { limit: 150 };
      if (filters.type) params.type = filters.type;
      if (filters.severity) params.severity = filters.severity;
      if (filters.resolved) params.resolved = filters.resolved;
      const data = await api.alerts(params);
      setRows(data.alerts || []);
    } catch {
      setRows([]);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Violations</h1>
          <p className="view-desc">Every red-light, over-speed and lane violation the engine has flagged.</p>
        </div>
        <div className="view-actions">
          <a className="btn" href={exportUrls.violationsCsv(24)}>Export CSV</a>
          <a className="btn" href={exportUrls.violationsPdf(24)}>Export PDF</a>
        </div>
      </div>

      <div className="filters">
        <label className="field">
          <span>Type</span>
          <select value={filters.type} onChange={set("type")}>
            <option value="">All types</option>
            <option value="red_light">Red light</option>
            <option value="over_speed">Over speed</option>
            <option value="wrong_lane">Wrong lane</option>
            <option value="parking_violation">Parking violation</option>
          </select>
        </label>
        <label className="field">
          <span>Severity</span>
          <select value={filters.severity} onChange={set("severity")}>
            <option value="">All severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={filters.resolved} onChange={set("resolved")}>
            <option value="">All</option>
            <option value="false">Open</option>
            <option value="true">Resolved</option>
          </select>
        </label>
        <button className="btn btn-ghost" onClick={load}>Refresh</button>
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Time</th><th>Type</th><th>Plate</th><th>Camera</th><th>Detail</th><th>Severity</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={8} className="tbl-empty">Loading…</td></tr>}
            {rows && rows.length === 0 && <tr><td colSpan={8} className="tbl-empty">No violations match these filters.</td></tr>}
            {rows && rows.map((v) => (
              <tr key={v.violation_id}>
                <td className="time-cell">{fmtDateTime(v.timestamp)}</td>
                <td>{prettyType(v.type)}</td>
                <td><PlateChip plate={v.plate} confidence={v.confidence} /></td>
                <td>{v.camera_name || v.camera_id || "—"}</td>
                <td className="dim">{detailLine(v) || "—"}</td>
                <td><Severity level={v.severity} /></td>
                <td>{v.resolved ? <span className="resolved-tag">✓ Resolved</span> : "Open"}</td>
                <td><button className="btn btn-sm" onClick={() => openModal(v)}>{v.resolved ? "View" : "Resolve"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
