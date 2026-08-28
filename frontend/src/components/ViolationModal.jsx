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

          <div className="evidence">
            {evidence
              ? <img src={evidence} alt="Violation evidence frame" />
              : <span>◎ Evidence frame captured at detection<br />(image pipeline stub in simulation mode)</span>}
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
