import { useState } from "react";
import { api } from "../services/api.js";
import { prettyType } from "../services/format.js";
import { PlateChip } from "../components/PlateChip.jsx";

export function Upload({ cameras = [] }) {
  // state for each camera upload: { [cameraId]: { status, msg, results } }
  const [uploads, setUploads] = useState({});

  const handleFileChange = async (cameraId, file) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setUploads((prev) => ({
        ...prev,
        [cameraId]: { status: "error", msg: "Invalid file type. Please upload a video." },
      }));
      return;
    }

    setUploads((prev) => ({
      ...prev,
      [cameraId]: { status: "uploading", msg: "Uploading & processing video..." },
    }));

    try {
      const data = await api.uploadVideo(cameraId, file);
      setUploads((prev) => ({
        ...prev,
        [cameraId]: { status: "success", results: data },
      }));
    } catch (err) {
      setUploads((prev) => ({
        ...prev,
        [cameraId]: { status: "error", msg: err.message || "Failed to process video." },
      }));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, cameraId) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    handleFileChange(cameraId, file);
  };

  // If no cameras are loaded, show a loading placeholder
  const activeCameras = cameras.length > 0 ? cameras : [
    { id: "cam_1", name: "Sitabuldi Intersection", speed_limit_kmh: 50 },
    { id: "cam_2", name: "Dhantoli Intersection", speed_limit_kmh: 40 },
    { id: "cam_3", name: "Nagpur Square (Variety)", speed_limit_kmh: 50 },
    { id: "cam_4", name: "Ajni Square", speed_limit_kmh: 60 },
    { id: "cam_5", name: "Sadar Bazaar", speed_limit_kmh: 40 },
  ];

  return (
    <section className="view view-upload">
      <div className="view-head">
        <div>
          <h1 className="view-title">Video Intelligence Ingestion</h1>
          <p className="view-desc">
            Upload traffic feed clips for any of the 5 calibrated cameras. The ANPR engine will detect license plates, estimate speeds, and evaluate traffic violations in real-time.
          </p>
        </div>
      </div>

      <div className="upload-grid" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
        {activeCameras.map((cam) => {
          const state = uploads[cam.id] || { status: "idle" };
          const hasResults = state.status === "success" && state.results;
          const detections = hasResults ? state.results.detections : [];
          const violations = hasResults ? state.results.violations : [];

          return (
            <section key={cam.id} className="panel upload-panel" style={{ padding: "16px" }}>
              <div className="panel-head" style={{ borderBottom: "1px solid var(--rule)", paddingBottom: "10px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 className="eyebrow" style={{ fontSize: "14px", fontWeight: "600" }}>{cam.name}</h2>
                  <span className="mono dim" style={{ fontSize: "11px" }}>{cam.id.toUpperCase()} · Speed Limit: {cam.speed_limit_kmh} km/h</span>
                </div>
                {state.status === "success" && (
                  <span className="feed-count mono" style={{ background: "rgba(0,229,208,.08)", borderColor: "var(--cyan-dim)", color: "var(--cyan-soft)" }}>
                    {detections.length} Detection{detections.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--gap)" }}>
                {/* Left Side: Upload Zone */}
                <div 
                  className={`evidence ${state.status === "uploading" ? "uploading" : ""}`}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, cam.id)}
                  style={{
                    minHeight: "180px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px dashed var(--rule-hi)",
                    borderRadius: "var(--r)",
                    background: "var(--deck-2)",
                    padding: "20px",
                    textAlign: "center",
                    cursor: "pointer",
                    position: "relative",
                    transition: "border-color .15s, background .15s"
                  }}
                  onClick={() => document.getElementById(`file-input-${cam.id}`).click()}
                >
                  <input
                    id={`file-input-${cam.id}`}
                    type="file"
                    accept="video/*"
                    style={{ display: "none" }}
                    onChange={(e) => handleFileChange(cam.id, e.target.files?.[0])}
                  />

                  {state.status === "idle" && (
                    <>
                      <span style={{ fontSize: "28px", color: "var(--cyan)" }}>⤓</span>
                      <strong style={{ display: "block", marginTop: "10px", color: "var(--ink)", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".08em" }}>
                        Drag & Drop Video
                      </strong>
                      <span className="dim" style={{ fontSize: "11.5px", marginTop: "4px" }}>or click to browse local traffic feed clips</span>
                    </>
                  )}

                  {state.status === "uploading" && (
                    <>
                      <div className="spinner" style={{
                        width: "32px",
                        height: "32px",
                        border: "3px solid var(--rule-hi)",
                        borderTop: "3px solid var(--cyan)",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                        marginBottom: "12px"
                      }} />
                      <strong style={{ color: "var(--cyan-soft)", fontSize: "12px" }}>{state.msg}</strong>
                      <span className="dim" style={{ fontSize: "11px", marginTop: "4px" }}>Parsing frames, running ANPR & speed tracking...</span>
                    </>
                  )}

                  {state.status === "success" && (
                    <>
                      <span style={{ fontSize: "28px", color: "var(--green)" }}>✓</span>
                      <strong style={{ display: "block", marginTop: "10px", color: "var(--green)", fontSize: "12px", textTransform: "uppercase" }}>
                        Processing Complete
                      </strong>
                      <span className="dim" style={{ fontSize: "11.5px", marginTop: "4px" }}>
                        Processed {state.results.processed_frames} frames. Click to upload another clip.
                      </span>
                    </>
                  )}

                  {state.status === "error" && (
                    <>
                      <span style={{ fontSize: "28px", color: "var(--red)" }}>⚠</span>
                      <strong style={{ display: "block", marginTop: "10px", color: "var(--red)", fontSize: "12px", textTransform: "uppercase" }}>
                        Upload Failed
                      </strong>
                      <span style={{ fontSize: "11.5px", marginTop: "4px", color: "var(--red)" }}>{state.msg}</span>
                    </>
                  )}
                </div>

                {/* Right Side: Results Display */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", minHeight: "180px", background: "rgba(10, 16, 23, 0.4)", borderRadius: "var(--r)", padding: "12px", border: "1px solid var(--rule)" }}>
                  <h3 className="eyebrow" style={{ fontSize: "10.5px", color: "var(--ink-mute)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: "4px" }}>
                    Detections & Analytics
                  </h3>
                  
                  {state.status === "idle" && (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-mute)", fontSize: "12px", fontStyle: "italic" }}>
                      Upload video to view intelligence analytics...
                    </div>
                  )}

                  {state.status === "uploading" && (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cyan-soft)", fontSize: "12px", fontStyle: "italic" }}>
                      Processing feed in real-time...
                    </div>
                  )}

                  {state.status === "error" && (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--red)", fontSize: "12px", fontStyle: "italic" }}>
                      An error occurred during ingestion.
                    </div>
                  )}

                  {state.status === "success" && (
                    <div style={{ flex: 1, overflowY: "auto", maxHeight: "220px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {detections.length === 0 && (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-mute)", fontSize: "12px" }}>
                          No vehicles detected in this clip.
                        </div>
                      )}
                      
                      {detections.map((d, index) => {
                        const isSpeeder = d.speed_kmh > cam.speed_limit_kmh;
                        return (
                          <div key={index} style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            padding: "6px 10px",
                            background: "linear-gradient(180deg, rgba(15, 22, 29, .95), rgba(11, 17, 23, .9))",
                            border: "1px solid var(--rule)",
                            borderRadius: "var(--r)",
                            fontSize: "12px"
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <PlateChip plate={d.plate} />
                              <span style={{ color: "var(--ink-dim)", fontSize: "11px" }}>{d.vehicle_color} · {d.vehicle_type}</span>
                            </div>
                            
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span className="mono" style={{ 
                                fontWeight: "600",
                                color: isSpeeder ? "var(--red)" : "var(--cyan-soft)"
                              }}>
                                {d.speed_kmh ? `${Math.round(d.speed_kmh)} km/h` : "—"}
                              </span>
                              {isSpeeder && (
                                <span style={{
                                  fontSize: "9px",
                                  background: "rgba(255,59,71,.12)",
                                  border: "1px solid rgba(255,59,71,.4)",
                                  color: "var(--red)",
                                  padding: "1px 4px",
                                  borderRadius: "2px",
                                  fontWeight: "700"
                                }}>
                                  SPEEDING
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {violations.length > 0 && (
                        <div style={{ marginTop: "8px", borderTop: "1px solid var(--rule)", paddingTop: "8px" }}>
                          <h4 className="eyebrow" style={{ fontSize: "9.5px", color: "var(--red)", marginBottom: "4px" }}>
                            Generated Violations
                          </h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {violations.map((v, idx) => (
                              <div key={idx} style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "4px 8px",
                                background: "rgba(255, 59, 71, 0.05)",
                                border: "1px solid rgba(255, 59, 71, 0.2)",
                                borderRadius: "var(--r)",
                                fontSize: "11px"
                              }}>
                                <span style={{ color: "var(--red)", fontWeight: "600" }}>
                                  ⚠ {prettyType(v.type)}
                                </span>
                                <span className="mono" style={{ color: "var(--ink)" }}>{v.plate}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .evidence:hover {
          border-color: var(--cyan) !important;
          background: rgba(0, 229, 208, 0.02) !important;
        }
      `}</style>
    </section>
  );
}
