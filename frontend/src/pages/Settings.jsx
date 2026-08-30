import { useEffect, useState } from "react";
import { api, setWriteKey, writeKey } from "../services/api.js";
import { sound } from "../services/sound.js";

const DEFAULT_PREFS = {
  ocrConfidence: 0.65,
  speedToleranceKmh: 5,
  lowLightBoost: true,
  laneSensitivity: "standard",
  soundEnabled: true,
  soundSeverity: "high",
  toastDurationSec: 8,
  autoDismissResolved: false,
  streamIntervalSec: 2,
};

const STORAGE_KEY = "anpr.user_preferences";

function loadSavedPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    /* fallback to defaults */
  }
  return DEFAULT_PREFS;
}

export function Settings() {
  const [activeTab, setActiveTab] = useState("anpr");
  const [prefs, setPrefs] = useState(loadSavedPrefs);
  const [apiKeyInput, setApiKeyInput] = useState(writeKey());
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  // Diagnostics & maintenance state
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState("");
  const [purgeError, setPurgeError] = useState("");
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const updatePref = (key, val) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: val };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage quota */
      }
      return next;
    });
    flashFeedback("Settings updated");
  };

  const flashFeedback = (msg) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(""), 3000);
  };

  const loadDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const [diag, cams, h] = await Promise.all([
        api.diagnostics().catch(() => null),
        api.cameras().catch(() => []),
        api.health().catch(() => null),
      ]);
      setDiagnostics(diag);
      setCameras(cams || []);
      setHealth(h);
    } catch {
      /* non-fatal */
    } finally {
      setDiagLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const handleSaveKey = (e) => {
    e.preventDefault();
    setWriteKey(apiKeyInput.trim());
    setKeySaved(true);
    sound.play("success");
    flashFeedback("Operator API key saved");
    setTimeout(() => setKeySaved(false), 3000);
  };

  const handleClearKey = () => {
    setWriteKey("");
    setApiKeyInput("");
    flashFeedback("API key cleared");
  };

  const handlePurge = async () => {
    setBusy(true);
    setPurgeMessage("");
    setPurgeError("");
    setShowPurgeConfirm(false);
    try {
      const result = await api.purgeOldData();
      sound.play("purge");
      setPurgeMessage(
        `Purged ${result.detections_deleted ?? 0} detection rows, ${result.trajectories_deleted ?? 0} trajectories, and ${result.violations_deleted ?? 0} violations.`
      );
      loadDiagnostics();
    } catch (err) {
      setPurgeError(err?.message || "Failed to purge old data. Check operator permissions.");
    } finally {
      setBusy(false);
    }
  };

  const handleTestSound = (type = "test") => {
    sound.play(type);
  };

  const handleExportConfig = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      user_preferences: prefs,
      system_diagnostics: diagnostics,
      camera_fleet: cameras,
      health_status: health,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anpr-settings-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flashFeedback("Configuration JSON exported");
  };

  const handleResetDefaults = () => {
    if (window.confirm("Reset all user preferences to factory defaults?")) {
      setPrefs(DEFAULT_PREFS);
      localStorage.removeItem(STORAGE_KEY);
      flashFeedback("Preferences reset to defaults");
    }
  };

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Settings & Operational Controls</h1>
          <p className="view-desc">
            ANPR threshold tuning, real-time alert filters, camera infrastructure, security keys, and maintenance.
          </p>
        </div>
        {feedbackMsg && <div className="settings-badge-feedback">{feedbackMsg}</div>}
      </div>

      <div className="settings-nav-tabs" role="tablist">
        <button
          className={`tab ${activeTab === "anpr" ? "active" : ""}`}
          aria-selected={activeTab === "anpr"}
          onClick={() => setActiveTab("anpr")}
        >
          <svg viewBox="0 0 24 24" className="tab-ico"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" /></svg>
          ANPR Rules & Detection
        </button>
        <button
          className={`tab ${activeTab === "alerts" ? "active" : ""}`}
          aria-selected={activeTab === "alerts"}
          onClick={() => setActiveTab("alerts")}
        >
          <svg viewBox="0 0 24 24" className="tab-ico"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /></svg>
          Alerts & Audio
        </button>
        <button
          className={`tab ${activeTab === "cameras" ? "active" : ""}`}
          aria-selected={activeTab === "cameras"}
          onClick={() => setActiveTab("cameras")}
        >
          <svg viewBox="0 0 24 24" className="tab-ico"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" /></svg>
          Camera Fleet
        </button>
        <button
          className={`tab ${activeTab === "security" ? "active" : ""}`}
          aria-selected={activeTab === "security"}
          onClick={() => setActiveTab("security")}
        >
          <svg viewBox="0 0 24 24" className="tab-ico"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" /></svg>
          Security & Access
        </button>
        <button
          className={`tab ${activeTab === "maintenance" ? "active" : ""}`}
          aria-selected={activeTab === "maintenance"}
          onClick={() => setActiveTab("maintenance")}
        >
          <svg viewBox="0 0 24 24" className="tab-ico"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.18l-2.39.96a7.3 7.3 0 0 0-1.63-.94L14.45 2.5a.5.5 0 0 0-.5-.34h-3.9a.5.5 0 0 0-.5.34l-.4 2.5c-.56.23-1.1.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.18L2.7 9.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 13.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.18l2.39-.96c.53.4 1.07.71 1.63.94l.4 2.5a.5.5 0 0 0 .5.34h3.9a.5.5 0 0 0 .5-.34l.4-2.5c.56-.23 1.1-.54 1.63-.94l2.39.96a.5.5 0 0 0 .61-.18l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" /></svg>
          Diagnostics & Storage
        </button>
      </div>

      {/* ───────────────── TAB 1: ANPR RULES & DETECTION ───────────────── */}
      {activeTab === "anpr" && (
        <div className="settings-container">
          <div className="panel">
            <div className="panel-head">
              <h2 className="eyebrow">ANPR Recognition & OCR Confidence Floor</h2>
            </div>
            <div className="settings-form">
              <div className="setting-control-row">
                <div className="setting-meta">
                  <span className="setting-title">Plate OCR Confidence Threshold</span>
                  <span className="setting-desc">
                    Plates below this score trigger a low-light/poor-read alert banner and warning chip.
                  </span>
                </div>
                <div className="setting-field-action">
                  <input
                    type="range"
                    min="0.50"
                    max="0.95"
                    step="0.05"
                    value={prefs.ocrConfidence}
                    onChange={(e) => updatePref("ocrConfidence", parseFloat(e.target.value))}
                    className="slider"
                  />
                  <span className="setting-badge mono">{Math.round(prefs.ocrConfidence * 100)}%</span>
                </div>
              </div>

              <div className="setting-control-row">
                <div className="setting-meta">
                  <span className="setting-title">Speed Violation Tolerance Buffer</span>
                  <span className="setting-desc">
                    Speed above posted limit required to trigger an over-speed violation alert.
                  </span>
                </div>
                <div className="setting-field-action">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={prefs.speedToleranceKmh}
                    onChange={(e) => updatePref("speedToleranceKmh", parseInt(e.target.value, 10))}
                    className="slider"
                  />
                  <span className="setting-badge mono">+{prefs.speedToleranceKmh} km/h</span>
                </div>
              </div>

              <div className="setting-control-row">
                <div className="setting-meta">
                  <span className="setting-title">Night & Low-Light Enhancement Filter</span>
                  <span className="setting-desc">
                    Apply automatic contrast enhancement (CLAHE) on nighttime video frames.
                  </span>
                </div>
                <div className="setting-field-action">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={prefs.lowLightBoost}
                      onChange={(e) => updatePref("lowLightBoost", e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="setting-control-row">
                <div className="setting-meta">
                  <span className="setting-title">Wrong Lane Compliance Sensitivity</span>
                  <span className="setting-desc">
                    Strictness of vehicle lane-marking tracking across camera junction lines.
                  </span>
                </div>
                <div className="setting-field-action">
                  <select
                    className="setting-select"
                    value={prefs.laneSensitivity}
                    onChange={(e) => updatePref("laneSensitivity", e.target.value)}
                  >
                    <option value="strict">Strict (Immediate alert)</option>
                    <option value="standard">Standard (2 frame persistence)</option>
                    <option value="relaxed">Relaxed (4 frame persistence)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────── TAB 2: ALERTS & AUDIO ───────────────── */}
      {activeTab === "alerts" && (
        <div className="settings-container">
          <div className="panel">
            <div className="panel-head">
              <h2 className="eyebrow">Real-Time Auditory & Visual Notifications</h2>
            </div>
            <div className="settings-form">
              <div className="setting-control-row">
                <div className="setting-meta">
                  <span className="setting-title">Sound Chimes on High Severity Violations</span>
                  <span className="setting-desc">
                    Synthesizes an immediate warning chime through the Web Audio API when red-light or high-speed violations occur.
                  </span>
                </div>
                <div className="setting-field-action">
                  <button className="btn btn-sm" onClick={() => handleTestSound("high")}>
                    🔊 Test High Alert
                  </button>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={prefs.soundEnabled}
                      onChange={(e) => updatePref("soundEnabled", e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="setting-control-row">
                <div className="setting-meta">
                  <span className="setting-title">Toast Notification Display Duration</span>
                  <span className="setting-desc">
                    Time in seconds violation pop-up cards stay visible in the control room viewport.
                  </span>
                </div>
                <div className="setting-field-action">
                  <input
                    type="range"
                    min="3"
                    max="15"
                    step="1"
                    value={prefs.toastDurationSec}
                    onChange={(e) => updatePref("toastDurationSec", parseInt(e.target.value, 10))}
                    className="slider"
                  />
                  <span className="setting-badge mono">{prefs.toastDurationSec}s</span>
                </div>
              </div>

              <div className="setting-control-row">
                <div className="setting-meta">
                  <span className="setting-title">Auto-Dismiss Resolved Violations</span>
                  <span className="setting-desc">
                    Automatically remove violations from the active alert queue once marked resolved by an operator.
                  </span>
                </div>
                <div className="setting-field-action">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={prefs.autoDismissResolved}
                      onChange={(e) => updatePref("autoDismissResolved", e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="setting-control-row">
                <div className="setting-meta">
                  <span className="setting-title">WebSocket Feed Throttle Interval</span>
                  <span className="setting-desc">
                    Live stream transmission rate from the backend tracking engine to the browser.
                  </span>
                </div>
                <div className="setting-field-action">
                  <select
                    className="setting-select"
                    value={prefs.streamIntervalSec}
                    onChange={(e) => updatePref("streamIntervalSec", parseInt(e.target.value, 10))}
                  >
                    <option value="1">1.0s (Ultra-low latency)</option>
                    <option value="2">2.0s (Balanced / Standard)</option>
                    <option value="5">5.0s (Bandwidth saving)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────── TAB 3: CAMERA FLEET ───────────────── */}
      {activeTab === "cameras" && (
        <div className="settings-container">
          <div className="panel">
            <div className="panel-head">
              <h2 className="eyebrow">Configured Camera Fleet Nodes ({cameras.length})</h2>
              <button className="btn btn-sm" onClick={loadDiagnostics} disabled={diagLoading}>
                {diagLoading ? "Refreshing…" : "Refresh Fleet"}
              </button>
            </div>

            <div className="camera-settings-grid">
              {cameras.map((cam) => (
                <div key={cam.id} className="camera-node-card">
                  <div className="camera-card-top">
                    <span className="camera-id mono">{cam.id}</span>
                    <span className="camera-status-pill online">Active</span>
                  </div>
                  <h3 className="camera-name">{cam.name || cam.id}</h3>
                  <div className="camera-specs">
                    <div className="spec-item">
                      <span className="spec-label">Coordinates</span>
                      <span className="spec-val mono">
                        {cam.position?.lat?.toFixed(4)}, {cam.position?.lng?.toFixed(4)}
                      </span>
                    </div>
                    <div className="spec-item">
                      <span className="spec-label">Posted Limit</span>
                      <span className="spec-val mono">{cam.speed_limit_kmh ?? 50} km/h</span>
                    </div>
                    <div className="spec-item">
                      <span className="spec-label">Lanes</span>
                      <span className="spec-val mono">{(cam.lanes || []).length || 3} monitored</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ───────────────── TAB 4: SECURITY & ACCESS ───────────────── */}
      {activeTab === "security" && (
        <div className="settings-container">
          <div className="panel">
            <div className="panel-head">
              <h2 className="eyebrow">Operator Authorization & API Key Management</h2>
            </div>
            <div className="settings-form">
              <div className="setting-control-row" style={{ alignItems: "flex-start" }}>
                <div className="setting-meta">
                  <span className="setting-title">Operator API Write Key</span>
                  <span className="setting-desc">
                    Required to mark violations resolved and purge old datasets when running in write-protected deployments.
                    Stored securely in sessionStorage so it never touches disk.
                  </span>
                </div>
                <form onSubmit={handleSaveKey} className="setting-key-form">
                  <div className="key-input-wrap">
                    <input
                      type={showKey ? "text" : "password"}
                      className="notes-input mono"
                      placeholder="Enter ANPR_API_KEY…"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? "Hide" : "Show"}
                    </button>
                  </div>
                  <div className="key-actions">
                    <button type="submit" className="btn btn-primary btn-sm">
                      {keySaved ? "✓ Key Saved" : "Save Key"}
                    </button>
                    {writeKey() && (
                      <button type="button" className="btn btn-sm" onClick={handleClearKey}>
                        Clear
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div className="setting-control-row">
                <div className="setting-meta">
                  <span className="setting-title">Deployment Posture</span>
                  <span className="setting-desc">Server-enforced access constraints received from backend.</span>
                </div>
                <div className="setting-field-action">
                  <span className={`posture-badge ${health?.write_protected ? "protected" : "open"}`}>
                    {health?.read_only
                      ? "Read-Only Mode"
                      : health?.write_protected
                      ? "Write-Protected (Key Required)"
                      : "Open Local Development"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────── TAB 5: DIAGNOSTICS & STORAGE ───────────────── */}
      {activeTab === "maintenance" && (
        <div className="settings-container">
          <div className="panel">
            <div className="panel-head">
              <h2 className="eyebrow">Database Row Counts & Storage Retention</h2>
              <button className="btn btn-sm" onClick={loadDiagnostics} disabled={diagLoading}>
                {diagLoading ? "Scanning…" : "Scan Database"}
              </button>
            </div>

            <div className="diag-kpi-grid">
              <div className="diag-kpi-card">
                <span className="diag-label">Detections</span>
                <strong className="diag-val mono">{diagnostics?.counts?.detections?.toLocaleString() ?? "—"}</strong>
                <span className="diag-sub">Retention: 7 days</span>
              </div>
              <div className="diag-kpi-card">
                <span className="diag-label">Trajectories</span>
                <strong className="diag-val mono">{diagnostics?.counts?.trajectories?.toLocaleString() ?? "—"}</strong>
                <span className="diag-sub">Retention: 30 days</span>
              </div>
              <div className="diag-kpi-card">
                <span className="diag-label">Violations</span>
                <strong className="diag-val mono">{diagnostics?.counts?.violations?.toLocaleString() ?? "—"}</strong>
                <span className="diag-sub">Retention: 90 days</span>
              </div>
              <div className="diag-kpi-card">
                <span className="diag-label">Active Cameras</span>
                <strong className="diag-val mono">{diagnostics?.counts?.cameras ?? cameras.length}</strong>
                <span className="diag-sub">Engine: Healthy</span>
              </div>
            </div>

            <div className="settings-actions-bar">
              <div className="left-actions">
                <button className="btn" onClick={handleExportConfig}>
                  📥 Export Diagnostics JSON
                </button>
                <button className="btn btn-ghost" onClick={handleResetDefaults}>
                  Reset Defaults
                </button>
              </div>
              <div className="right-actions">
                <button
                  className="btn btn-primary btn-danger"
                  onClick={() => setShowPurgeConfirm(true)}
                  disabled={busy}
                >
                  {busy ? "Purging…" : "Purge Expired Records"}
                </button>
              </div>
            </div>

            {showPurgeConfirm && (
              <div className="purge-confirm-box">
                <p>
                  <strong>Confirm Maintenance Purge:</strong> This will permanently delete detections older than 7 days, trajectories older than 30 days, and violations older than 90 days.
                </p>
                <div className="confirm-actions">
                  <button className="btn btn-sm" onClick={() => setShowPurgeConfirm(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={handlePurge}>
                    Yes, Purge Expired Data
                  </button>
                </div>
              </div>
            )}

            {purgeMessage && <p className="success-msg">{purgeMessage}</p>}
            {purgeError && <p className="search-msg">{purgeError}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
