import { useState } from "react";
import { api } from "../services/api.js";

export function Settings() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handlePurge = async () => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await api.purgeOldData();
      setMessage(
        `Purged ${result.detections_deleted ?? 0} detection rows, ${result.trajectories_deleted ?? 0} trajectories, and ${result.violations_deleted ?? 0} violations.`
      );
    } catch (err) {
      setError(err?.message || "Failed to purge old data.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Settings</h1>
          <p className="view-desc">System retention, operational controls, and maintenance actions.</p>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 760 }}>
        <div className="panel-head">
          <h2 className="eyebrow">Data retention</h2>
        </div>

        <div className="settings-grid">
          <div className="setting-row">
            <span>Detections</span>
            <strong>7 days</strong>
          </div>
          <div className="setting-row">
            <span>Trajectories</span>
            <strong>30 days</strong>
          </div>
          <div className="setting-row">
            <span>Violations</span>
            <strong>90 days</strong>
          </div>
        </div>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={handlePurge} disabled={busy}>
            {busy ? "Purging…" : "Purge old data"}
          </button>
        </div>

        {message && <p className="success-msg">{message}</p>}
        {error && <p className="search-msg">{error}</p>}
      </div>
    </section>
  );
}
