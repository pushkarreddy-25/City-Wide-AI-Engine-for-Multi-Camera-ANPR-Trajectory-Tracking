import { useState } from "react";
import { api, setWriteKey } from "../services/api.js";
import { fmtDateTime, prettyType, detailLine, safeImageUrl } from "../services/format.js";
import { PlateChip, Severity } from "./PlateChip.jsx";

export function ViolationModal({ violation, onClose, onResolved }) {
  const [notes, setNotes] = useState("");
  const [key, setKey] = useState("");
  const [needsKey, setNeedsKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!violation) return null;
  const v = violation;
  const detail = detailLine(v);
  const evidence = safeImageUrl(v.evidence_image_url);

  async function resolve() {
    setBusy(true); setError(null);
    if (key.trim()) setWriteKey(key.trim());
    try {
      const updated = await api.resolveViolation(v.violation_id, notes);
      onResolved && onResolved(v.violation_id, { ...updated, resolved: true, notes });
      onClose();
    } catch (e) {
      // 401 means the server wants an operator key (ANPR_API_KEY). Drop whatever
      // we sent and ask for it rather than retrying a rejected credential.
      if (e.status === 401) { setWriteKey(""); setKey(""); setNeedsKey(true); }
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal" onClick={(e) => { if (e.target.classList.contains("modal")) onClose(); }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <div className="modal-head">
          <h2 id="m-title">Violation detail</h2>
          <button className="modal-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <dl className="detail-grid">
            <dt>Type</dt><dd>{prettyType(v.type)}</dd>
            <dt>Plate</dt><dd><PlateChip plate={v.plate} confidence={v.confidence} /></dd>
            <dt>Camera</dt><dd>{v.camera_name || v.camera_id || "—"}</dd>
            <dt>Time</dt><dd className="mono">{fmtDateTime(v.timestamp)}</dd>
            <dt>Severity</dt><dd><Severity level={v.severity} /></dd>
            {detail && (<><dt>Detail</dt><dd>{detail}</dd></>)}
            <dt>Confidence</dt><dd className="mono">{v.confidence != null ? Math.round(v.confidence * 100) + "%" : "—"}</dd>
            <dt>Status</dt><dd>{v.resolved ? <span className="resolved-tag">✓ Resolved</span> : "Open"}</dd>
          </dl>

          <div className="evidence" style={{ overflow: "hidden", position: "relative" }}>
            {evidence
              ? <img src={evidence} alt="Violation evidence frame" />
              : (
                <div className="simulated-preview" style={{ 
                  width: "100%", height: "200px", 
                  background: "#050b14", 
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--rule)",
                  borderRadius: "6px"
                }}>
                  {/* Grid background */}
                  <div style={{ position: "absolute", inset: 0, opacity: 0.1, backgroundImage: "linear-gradient(#0066cc 1px, transparent 1px), linear-gradient(90deg, #0066cc 1px, transparent 1px)", backgroundSize: "20px 20px" }}></div>
                  
                  {/* Vehicle Shape */}
                  <div style={{
                    width: "120px", height: "80px",
                    background: "rgba(255,255,255,0.05)",
                    border: "2px solid rgba(255,255,255,0.2)",
                    borderRadius: "10px 10px 4px 4px",
                    position: "relative",
                    marginTop: "20px"
                  }}>
                    {/* License Plate Box */}
                    <div style={{
                      position: "absolute",
                      bottom: "10px", left: "50%",
                      transform: "translateX(-50%)",
                      width: "60px", height: "20px",
                      background: "#fff",
                      border: "2px solid #ccc",
                      borderRadius: "2px",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      <span className="mono" style={{ color: "#000", fontSize: "10px", fontWeight: "bold" }}>{v.plate}</span>
                    </div>
                  </div>

                  {/* ANPR Tracking Box (animated) */}
                  <div className="tracking-box" style={{
                    position: "absolute",
                    bottom: "20px", left: "50%",
                    transform: "translateX(-50%)",
                    width: "70px", height: "30px",
                    border: "2px solid #00ff00",
                    boxShadow: "0 0 10px #00ff00",
                    animation: "pulse-box 2s infinite"
                  }}>
                    {/* Scanning Laser */}
                    <div style={{
                      width: "100%", height: "2px",
                      background: "#00ff00",
                      boxShadow: "0 0 8px #00ff00",
                      animation: "scan-laser 1.5s linear infinite"
                    }}></div>
                  </div>
                  
                  <div style={{ position: "absolute", top: "10px", left: "10px", color: "#00ff00", fontSize: "10px", fontFamily: "monospace", textShadow: "0 0 4px #00ff00" }}>
                    REC • ANPR ACTIVE
                  </div>
                  <div style={{ position: "absolute", top: "10px", right: "10px", color: "rgba(255,255,255,0.5)", fontSize: "10px", fontFamily: "monospace" }}>
                    SIMULATION MODE
                  </div>
                  
                  <style>{`
                    @keyframes pulse-box {
                      0% { transform: translateX(-50%) scale(1.1); opacity: 0.5; border-color: #ffb020; }
                      50% { transform: translateX(-50%) scale(1); opacity: 1; border-color: #00ff00; }
                      100% { transform: translateX(-50%) scale(1.1); opacity: 0.5; border-color: #ffb020; }
                    }
                    @keyframes scan-laser {
                      0% { transform: translateY(0); }
                      50% { transform: translateY(26px); }
                      100% { transform: translateY(0); }
                    }
                  `}</style>
                </div>
              )}
          </div>

          {v.resolved ? (
            v.notes ? <p className="dim">Notes: {v.notes}</p> : null
          ) : (
            <>
              <input className="notes-input" placeholder="Resolution notes (optional)…" maxLength={500}
                     value={notes} onChange={(e) => setNotes(e.target.value)} />
              {needsKey && (
                <input className="notes-input" type="password" autoComplete="off"
                       placeholder="Operator API key" value={key}
                       onChange={(e) => setKey(e.target.value)} />
              )}
              {error && <p className="modal-note warn">Could not resolve: {error}</p>}
              <div className="modal-actions">
                <button className="btn" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={resolve} disabled={busy}>
                  {busy ? "Resolving…" : "Mark resolved"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
