import { useState } from "react";
import { api } from "../services/api.js";
import { fmtDateTime, todayISO } from "../services/format.js";

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
          <section className="panel">
            <div className="panel-head">
              <h2 className="eyebrow">Sightings</h2>
              <span className="mono dim">{traj.plate}</span>
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
      )}
      {msg && <p className="search-msg">{msg}</p>}
    </section>
  );
}
