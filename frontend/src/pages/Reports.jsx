import { useEffect, useMemo, useState } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend,
} from "chart.js";
import { api, exportUrls } from "../services/api.js";
import { prettyType, TYPE_COLOR, todayISO } from "../services/format.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

/* Chart.js draws to canvas, so it cannot read CSS custom properties — the HUD
   palette has to be repeated here. Keep these in step with theme.css. */
const INK = "#7f939f";      // --ink-dim
const GRID = "#18242f";     // --rule
const ACCENT = "#00e5d0";   // --cyan
const DECK = "#0a1017";     // --deck, used as the doughnut's separator
ChartJS.defaults.color = INK;
ChartJS.defaults.font.family = "'Space Grotesk', system-ui, sans-serif";
ChartJS.defaults.font.size = 11;
ChartJS.defaults.borderColor = GRID;

function Kpi({ label, value }) {
  return <div className="kpi"><div className="kpi-label">{label}</div><div className="kpi-val">{value}</div></div>;
}

function CameraTable({ rows }) {
  const max = Math.max(...(rows || []).map((r) => r.count || 0), 1);
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr><th>Camera</th><th className="ta-r">Count</th></tr></thead>
        <tbody>
          {(!rows || rows.length === 0) && <tr><td colSpan={2} className="tbl-empty">No data</td></tr>}
          {rows && rows.map((r, i) => (
            <tr key={i}>
              <td>{r.camera_name || r.camera_id}</td>
              <td className="ta-r bar-cell">
                <span className="bar" style={{ width: `${((r.count || 0) / max * 100).toFixed(0)}%` }} />
                <span className="mono">{r.count ?? 0}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VolumeTab() {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    setErr(null);
    try { setData(await api.dailyVolume(date)); }
    catch (e) { setErr(e.message); setData(null); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const chart = useMemo(() => {
    const by = data?.by_hour || [];
    return {
      labels: by.map((h) => String(h.hour).padStart(2, "0")),
      datasets: [{ data: by.map((h) => h.count), backgroundColor: ACCENT, borderRadius: 2, maxBarThickness: 22 }],
    };
  }, [data]);

  return (
    <div className="tab-panel">
      <div className="report-controls">
        <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <button className="btn btn-primary" onClick={load}>Generate</button>
        <a className="btn" href={exportUrls.dailyVolumeCsv(date)}>Export CSV</a>
      </div>
      {err && <p className="search-msg">Could not load daily volume ({err}).</p>}
      <div className="report-summary">
        <Kpi label="Total vehicles" value={data?.total ?? 0} />
        <Kpi label="Peak hour" value={data?.peak_hour != null ? String(data.peak_hour).padStart(2, "0") + ":00" : "—"} />
        <Kpi label="Cameras" value={(data?.by_camera || []).length} />
      </div>
      <div className="report-grid">
        <section className="panel">
          <div className="panel-head"><h2 className="eyebrow">Vehicles by hour</h2></div>
          <div className="chart-box"><Bar data={chart} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: GRID } } } }} /></div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2 className="eyebrow">By camera</h2></div>
          <CameraTable rows={data?.by_camera} />
        </section>
      </div>
    </div>
  );
}

function ViolationTab() {
  const [hours, setHours] = useState("24");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    setErr(null);
    try { setData(await api.violationsSummary(hours)); }
    catch (e) { setErr(e.message); setData(null); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const types = Object.keys(data?.by_type || {});
  const chart = {
    labels: types.map(prettyType),
    datasets: [{ data: types.map((t) => data.by_type[t]), backgroundColor: types.map((t) => TYPE_COLOR[t] || ACCENT), borderColor: DECK, borderWidth: 3 }],
  };
  const repeatOffenders = data?.top_10_repeat_offenders || [];

  return (
    <div className="tab-panel">
      <div className="report-controls">
        <label className="field"><span>Window</span>
          <select value={hours} onChange={(e) => setHours(e.target.value)}>
            <option value="24">Last 24 hours</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option>
          </select>
        </label>
        <button className="btn btn-primary" onClick={load}>Generate</button>
      </div>
      {err && <p className="search-msg">Could not load violation summary ({err}).</p>}
      <div className="report-summary">
        <Kpi label="Total violations" value={data?.total ?? 0} />
        <Kpi label="High severity" value={data?.by_severity?.high ?? 0} />
        <Kpi label="Types" value={types.length} />
      </div>
      <div className="report-grid">
        <section className="panel">
          <div className="panel-head"><h2 className="eyebrow">By type</h2></div>
          <div className="chart-box">
            {types.length
              ? <Doughnut data={chart} options={{ responsive: true, maintainAspectRatio: false, cutout: "64%", plugins: { legend: { position: "bottom", labels: { padding: 16, usePointStyle: true } } } }} />
              : <p className="dim" style={{ textAlign: "center", paddingTop: 40 }}>No violations in this window.</p>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2 className="eyebrow">By camera</h2></div>
          <CameraTable rows={data?.by_camera} />
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><h2 className="eyebrow">Top 10 repeat offenders</h2></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Plate</th><th className="ta-r">Violations</th><th>Dates</th></tr></thead>
            <tbody>
              {repeatOffenders.length === 0 && <tr><td colSpan={3} className="tbl-empty">No repeat offenders in this window.</td></tr>}
              {repeatOffenders.map((row) => (
                <tr key={row.plate}>
                  <td className="mono">{row.plate}</td>
                  <td className="ta-r mono">{row.violation_count}</td>
                  <td>{(row.dates || []).slice(0, 5).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CongestionTab() {
  const [mins, setMins] = useState("10");
  const [cells, setCells] = useState(null);

  const load = async () => {
    setCells(null);
    try { setCells(await api.congestion(mins)); }
    catch { setCells([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const sorted = (cells || []).slice().sort((a, b) => (b.vehicle_count || 0) - (a.vehicle_count || 0));

  return (
    <div className="tab-panel">
      <div className="report-controls">
        <label className="field"><span>Window</span>
          <select value={mins} onChange={(e) => setMins(e.target.value)}>
            <option value="10">Last 10 min</option><option value="30">Last 30 min</option><option value="60">Last 60 min</option>
          </select>
        </label>
        <button className="btn btn-primary" onClick={load}>Refresh</button>
      </div>
      <div className="cong-cards">
        {cells === null && <p className="dim">Loading…</p>}
        {cells && cells.length === 0 && <p className="dim">No congestion data in this window.</p>}
        {sorted.map((c) => (
          <div key={c.camera_id} className="cong-card" data-level={c.level || "low"}>
            <div className="cong-name">{c.camera_name || c.camera_id}</div>
            <div className="cong-count">{c.vehicle_count ?? 0} <small>vehicles · {c.level || "low"}</small></div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  { key: "volume", label: "Daily volume", Comp: VolumeTab },
  { key: "viol", label: "Violation summary", Comp: ViolationTab },
  { key: "cong", label: "Congestion", Comp: CongestionTab },
];

export function Reports() {
  const [tab, setTab] = useState("volume");
  const Active = TABS.find((t) => t.key === tab).Comp;
  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Reports</h1>
          <p className="view-desc">Historical volume, violations and congestion for planning.</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} className="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      <Active />
    </section>
  );
}
