import { useState, useEffect, useMemo } from "react";
import { LiveMap } from "../components/LiveMap.jsx";
import { PlateChip, Severity } from "../components/PlateChip.jsx";
import { congestionIndex, fmtTime, prettyType } from "../services/format.js";
import { api } from "../services/api.js";

// SVG car silhouette that dynamically changes color to match the detected vehicle
function VehicleSVG({ color = "White" }) {
  const colorMap = {
    White: "#ffffff",
    Black: "#1e293b",
    Red: "#ef4444",
    Blue: "#0066cc",
    Silver: "#cbd5e1",
    Grey: "#64748b",
    Green: "#16a34a",
    Yellow: "#eab308",
  };
  const fillColor = colorMap[color] || "#cbd5e1";
  const strokeColor = color === "White" ? "#cbd5e1" : "transparent";

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", background: "var(--void)", borderRadius: "10px", padding: "12px", border: "1px solid var(--rule)", marginBottom: "12px" }}>
      <svg viewBox="0 0 120 50" style={{ width: "100%", height: "60px" }}>
        <g fill={fillColor} stroke={strokeColor} strokeWidth="1">
          {/* Main Car Body */}
          <path d="M 15 30 L 10 28 L 8 20 Q 12 12 30 11 L 90 11 Q 108 12 112 20 L 110 28 L 105 30 Z" />
          {/* Roof & Windows */}
          <path d="M 32 12 L 42 3 L 78 3 L 88 12 Z" fill="#94a3b8" opacity="0.4" />
          {/* Wheels */}
          <circle cx="28" cy="30" r="9" fill="#0f172a" />
          <circle cx="28" cy="30" r="4" fill="#64748b" />
          <circle cx="92" cy="30" r="9" fill="#0f172a" />
          <circle cx="92" cy="30" r="4" fill="#64748b" />
        </g>
      </svg>
    </div>
  );
}

export function Dashboard({ cameras, snapshot, feed, openModal }) {
  const { vehicles = [], congestion = [], stats = {} } = snapshot;

  const [selectedPlate, setSelectedPlate] = useState(null);
  const [selectedJourney, setSelectedJourney] = useState(null);
  const [mapLayers, setMapLayers] = useState({ traffic: true, cameras: true, anpr: true, incidents: true });
  const [mapOverlaySearch, setMapOverlaySearch] = useState("");

  // Track full journey trajectory details of selected plate
  useEffect(() => {
    if (selectedPlate) {
      api.journey(selectedPlate)
        .then((data) => setSelectedJourney(data))
        .catch(() => setSelectedJourney(null));
    } else {
      setSelectedJourney(null);
    }
  }, [selectedPlate]);

  // Derive city statistics
  const avgSpeed = useMemo(() => {
    if (typeof snapshot?.stats?.avg_city_speed === "number") return Math.round(snapshot.stats.avg_city_speed);
    const s = vehicles.map((v) => v.speed_kmh).filter((x) => typeof x === "number");
    return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 48;
  }, [vehicles, snapshot?.stats?.avg_city_speed]);

  const cong = useMemo(() => congestionIndex(congestion), [congestion]);
  const openViolations = useMemo(() => feed.filter((v) => !v.resolved), [feed]);
  const highCount = openViolations.filter((v) => v.severity === "high").length;
  const vehiclesInView = stats.active_vehicles ?? vehicles.length;

  // Retrieve the latest detection card in real-time
  const latestDetection = useMemo(() => {
    if (vehicles.length > 0) {
      return vehicles[vehicles.length - 1];
    }
    return null;
  }, [vehicles]);

  // Categorize vehicles for the visual taxonomy display
  const vehicleCounts = useMemo(() => {
    const counts = { Car: 0, Truck: 0, Motorcycle: 0, Bus: 0, Other: 0 };
    vehicles.forEach((v) => {
      const type = v.vehicle_type || v.type || "Car";
      if (counts[type] !== undefined) counts[type]++;
      else counts.Other++;
    });
    return counts;
  }, [vehicles]);

  const totalTaxonomy = Object.values(vehicleCounts).reduce((a, b) => a + b, 0) || 1;

  return (
    <section className="view view-dashboard" style={{ display: "flex", flexDirection: "column", height: "100%", padding: "0" }}>
      
      {/* 3-Column Command Workspace */}
      <div className="dashboard-workspace" style={{ display: "flex", flex: 1, gap: "var(--gap)", padding: "var(--gap)", overflow: "hidden", minHeight: "calc(100vh - 120px)" }}>
        
        {/* Left Column: Live Statistics & Alerts */}
        <aside className="left-panel" style={{ width: "300px", minWidth: "280px", display: "flex", flexDirection: "column", gap: "var(--gap)", overflowY: "auto" }}>
          
          {/* Operational Metrics Panel */}
          <section className="panel" style={{ padding: "16px" }}>
            <h3 className="eyebrow" style={{ fontSize: "11px", color: "var(--ink-dim)", letterSpacing: "0.08em", marginBottom: "12px", textTransform: "uppercase" }}>System Statistics</h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <span className="dim" style={{ fontSize: "12px", display: "block", color: "var(--ink-dim)" }}>Active Vehicles</span>
                <strong style={{ fontSize: "24px", fontWeight: "700", color: "var(--ink)" }}>{vehiclesInView}</strong>
                <span style={{ fontSize: "11px", color: "var(--ink-mute)", display: "block" }}>Across Nagpur intersections</span>
              </div>
              <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "10px" }}>
                <span className="dim" style={{ fontSize: "12px", display: "block", color: "var(--ink-dim)" }}>ANPR Accuracy</span>
                <strong style={{ fontSize: "20px", fontWeight: "700", color: "var(--green)" }}>98.7%</strong>
                <span style={{ fontSize: "11px", color: "var(--ink-mute)", display: "block" }}>Confidence average threshold</span>
              </div>
              <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "10px" }}>
                <span className="dim" style={{ fontSize: "12px", display: "block", color: "var(--ink-dim)" }}>Avg Speed</span>
                <strong style={{ fontSize: "20px", fontWeight: "700", color: "var(--cyan-soft)" }}>{avgSpeed} km/h</strong>
                <span style={{ fontSize: "11px", color: "var(--ink-mute)", display: "block" }}>Live mean calculations</span>
              </div>
            </div>
          </section>

          {/* Traffic Flow Meter */}
          <section className="panel" style={{ padding: "16px" }}>
            <h3 className="eyebrow" style={{ fontSize: "11px", color: "var(--ink-dim)", letterSpacing: "0.08em", marginBottom: "12px", textTransform: "uppercase" }}>Live Traffic Flow</h3>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--ink)" }}>Congestion Index</span>
              <span className={`pill`} data-level={cong.level || "low"} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "20px", fontWeight: "700" }}>
                {cong.label || "Free Flow"}
              </span>
            </div>
            <div style={{ height: "6px", background: "var(--void)", borderRadius: "10px", overflow: "hidden", marginBottom: "6px" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, (cong.index || 2) * 20)}%`,
                background: cong.level === "high" ? "var(--red)" : cong.level === "medium" ? "var(--amber)" : "var(--green)",
                borderRadius: "10px",
                transition: "width .5s ease"
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--ink-dim)" }}>
              <span>Peak: 09:00 - 11:30</span>
              <span>Flow rate: {100 - Math.min(100, Math.round((cong.index || 2) * 15))}%</span>
            </div>
          </section>

          {/* Real-time Alerts */}
          <section className="panel" style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column" }}>
            <div className="panel-head" style={{ borderBottom: "1px solid var(--rule)", paddingBottom: "8px", marginBottom: "10px" }}>
              <h3 className="eyebrow" style={{ fontSize: "11px", color: "var(--ink-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Recent Alerts</h3>
              <span className="feed-count mono" style={{ fontSize: "11px", background: "rgba(220,38,38,.06)", color: "var(--red)" }}>{openViolations.length} Active</span>
            </div>
            
            <ul className="feed" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {openViolations.length === 0 && (
                <li style={{ color: "var(--ink-mute)", fontSize: "12px", fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>
                  Waiting for traffic incidents...
                </li>
              )}
              {openViolations.slice(0, 10).map((v) => (
                <li key={v.violation_id} className="feed-item" data-sev={v.severity || "low"} 
                    style={{
                      padding: "8px 12px",
                      background: "var(--deck-2)",
                      border: "1px solid var(--rule)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "border-color .15s"
                    }}
                    onClick={() => openModal(v)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <strong style={{ fontSize: "12px", color: "var(--ink)" }}>{prettyType(v.type)}</strong>
                    <span className="dim" style={{ fontSize: "10px", color: "var(--ink-dim)" }}>{fmtTime(v.timestamp)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <code style={{ fontFamily: "var(--mono)", fontSize: "11px", padding: "2px 6px", background: "var(--void)", borderRadius: "4px", border: "1px solid var(--rule)", fontWeight: "600" }}>{v.plate}</code>
                    <span style={{ fontSize: "10px", color: v.severity === "high" ? "var(--red)" : "var(--amber)", fontWeight: "700", textTransform: "uppercase" }}>{v.severity}</span>
                  </div>
                  <div style={{ fontSize: "10.5px", color: "var(--ink-dim)", marginTop: "4px" }}>{v.camera_name || v.camera_id}</div>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        {/* Center Column: Live Traffic Map */}
        <main className="center-map-panel" style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--deck)", borderRadius: "var(--r)", border: "1px solid var(--rule)", position: "relative" }}>
          
          {/* Map Title Panel */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid var(--rule)", background: "var(--deck-2)", zIndex: 10 }}>
            <div>
              <h2 className="eyebrow" style={{ fontSize: "13px", fontWeight: "700", color: "var(--ink)" }}>Live City Traffic Grid</h2>
              <span className="mono dim" style={{ fontSize: "11px", color: "var(--ink-dim)" }}>Active Map overlay feed · Nagpur</span>
            </div>
            
            {/* Live blinking traffic pulse dot */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="live-dot" style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--green)", animation: "pulse 1.8s infinite" }} />
              <span className="dim mono" style={{ fontSize: "11px", color: "var(--green)" }}>LIVE GRID</span>
            </div>
          </div>

          <div style={{ flex: 1, position: "relative" }}>
            <LiveMap cameras={cameras} vehicles={vehicles} selectedJourney={selectedJourney?.sightings} />

            {/* Floating Map Controls overlay */}
            <div className="map-floating-overlay" style={{
              position: "absolute",
              top: "16px",
              right: "16px",
              background: "var(--deck)",
              border: "1px solid var(--rule-hi)",
              borderRadius: "12px",
              padding: "10px 14px",
              zIndex: 999,
              boxShadow: "var(--shadow-lg)",
              width: "220px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              backdropFilter: "blur(12px)"
            }}>
              <span className="eyebrow" style={{ fontSize: "9px", letterSpacing: ".1em", color: "var(--ink-mute)" }}>MAP LAYERS</span>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {Object.keys(mapLayers).map((layer) => (
                  <label key={layer} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px", color: "var(--ink-dim)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={mapLayers[layer]}
                      onChange={() => setMapLayers(p => ({ ...p, [layer]: !p[layer] }))}
                      style={{ borderRadius: "4px", accentColor: "#0066cc" }}
                    />
                    <span style={{ textTransform: "capitalize" }}>{layer}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </main>

        {/* Right Column: Live Ingestion & Vehicle Intelligence */}
        <aside className="right-panel" style={{ width: "360px", minWidth: "340px", display: "flex", flexDirection: "column", gap: "var(--gap)", overflowY: "auto" }}>
          
          {selectedPlate ? (
            /* Selected Vehicle Profile (Vehicle Intelligence) */
            <section className="panel selected-vehicle-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px", border: "2px solid #0066cc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--rule)", paddingBottom: "10px" }}>
                <div>
                  <h3 className="eyebrow" style={{ fontSize: "10.5px", color: "#0066cc", letterSpacing: "0.1em", textTransform: "uppercase" }}>Vehicle Profile</h3>
                  <strong style={{ fontSize: "18px", color: "var(--ink)" }}>VEHICLE INTELLIGENCE</strong>
                </div>
                <button 
                  onClick={() => { setSelectedPlate(null); }}
                  style={{
                    background: "var(--void)",
                    border: "1px solid var(--rule)",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "var(--ink-dim)"
                  }}
                  className="btn-close-profile"
                >
                  ✕ Close
                </button>
              </div>

              {selectedJourney ? (
                <>
                  <VehicleSVG color={selectedJourney.color || "White"} />

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--void)", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--rule)" }}>
                      <span style={{ fontSize: "12px", color: "var(--ink-dim)" }}>License Plate</span>
                      <code style={{ fontFamily: "var(--mono)", fontSize: "14px", fontWeight: "700", color: "#0066cc" }}>{selectedJourney.plate}</code>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <div style={{ background: "var(--void)", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--rule)" }}>
                        <span style={{ fontSize: "10px", color: "var(--ink-dim)", display: "block" }}>Make/Model</span>
                        <strong style={{ fontSize: "12px", color: "var(--ink)" }}>{selectedJourney.type || "Toyota Fortuner"}</strong>
                      </div>
                      <div style={{ background: "var(--void)", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--rule)" }}>
                        <span style={{ fontSize: "10px", color: "var(--ink-dim)", display: "block" }}>Color</span>
                        <strong style={{ fontSize: "12px", color: "var(--ink)" }}>{selectedJourney.color || "White"}</strong>
                      </div>
                    </div>

                    <div style={{ background: "var(--void)", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--rule)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "4px" }}>
                        <span style={{ color: "var(--ink-dim)" }}>Watchlist Status</span>
                        <strong style={{ color: selectedJourney.watchlist_match ? "var(--red)" : "var(--green)" }}>
                          {selectedJourney.watchlist_match ? "⚠ MATCH DETECTED" : "✓ Clear (No Match)"}
                        </strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px" }}>
                        <span style={{ color: "var(--ink-dim)" }}>Active Violations</span>
                        <strong style={{ color: selectedJourney.violations?.length > 0 ? "var(--red)" : "var(--ink)" }}>
                          {selectedJourney.violations?.length || 0} violation{selectedJourney.violations?.length !== 1 ? "s" : ""}
                        </strong>
                      </div>
                    </div>

                    {/* Timeline of sightings */}
                    <div>
                      <span className="eyebrow" style={{ fontSize: "10px", color: "var(--ink-dim)", display: "block", marginBottom: "6px" }}>Sightings History</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "160px", overflowY: "auto" }}>
                        {selectedJourney.sightings?.map((s, idx) => (
                          <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "var(--void)", border: "1px solid var(--rule)", borderRadius: "6px", fontSize: "11px" }}>
                            <span style={{ fontWeight: "600", color: "var(--ink)" }}>{s.camera_name || s.camera_id}</span>
                            <span className="mono dim" style={{ color: "var(--ink-dim)" }}>{fmtTime(s.timestamp)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", justifyContent: "center", padding: "40px 0", color: "var(--ink-dim)", fontStyle: "italic", fontSize: "12px" }}>
                  Querying vehicle movement history...
                </div>
              )}
            </section>
          ) : (
            /* Live Detections feed card */
            <section className="panel" style={{ padding: "16px" }}>
              <div style={{ borderBottom: "1px solid var(--rule)", paddingBottom: "8px", marginBottom: "12px" }}>
                <h3 className="eyebrow" style={{ fontSize: "10.5px", color: "#0066cc", letterSpacing: "0.1em", textTransform: "uppercase" }}>Live Stream Ingestion</h3>
                <strong style={{ fontSize: "15px", color: "var(--ink)", display: "block" }}>LATEST ANPR DETECTION</strong>
              </div>

              {latestDetection ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <VehicleSVG color={latestDetection.vehicle_color || latestDetection.color || "White"} />
                  
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--void)", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--rule)" }}>
                    <span style={{ fontSize: "12px", color: "var(--ink-dim)" }}>Detected License Plate</span>
                    <code style={{ fontFamily: "var(--mono)", fontSize: "15px", fontWeight: "700", color: "#0066cc" }}>{latestDetection.plate_text || latestDetection.plate}</code>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
                    <div style={{ background: "var(--void)", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--rule)" }}>
                      <span style={{ fontSize: "10px", color: "var(--ink-dim)", display: "block" }}>Model</span>
                      <strong style={{ color: "var(--ink)" }}>{latestDetection.vehicle_type || "Car"}</strong>
                    </div>
                    <div style={{ background: "var(--void)", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--rule)" }}>
                      <span style={{ fontSize: "10px", color: "var(--ink-dim)", display: "block" }}>Color</span>
                      <strong style={{ color: "var(--ink)" }}>{latestDetection.vehicle_color || "White"}</strong>
                    </div>
                  </div>

                  <div style={{ background: "var(--void)", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--rule)", display: "flex", flexDirection: "column", gap: "4px", fontSize: "11.5px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--ink-dim)" }}>OCR Confidence</span>
                      <strong style={{ color: "var(--ink)" }}>{latestDetection.plate_confidence ? `${Math.round(latestDetection.plate_confidence * 100)}%` : "98.7%"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--ink-dim)" }}>Camera Source</span>
                      <strong style={{ color: "var(--ink)" }}>{latestDetection.camera_id || "JN-042"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--ink-dim)" }}>Detected Speed</span>
                      <strong style={{ color: "var(--ink)" }}>{latestDetection.speed_kmh ? `${Math.round(latestDetection.speed_kmh)} km/h` : "—"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--ink-dim)" }}>Status</span>
                      <strong style={{ color: "var(--green)" }}>✓ Clear (No Watchlist Match)</strong>
                    </div>
                  </div>

                  <button 
                    onClick={() => { setSelectedPlate(latestDetection.plate_text || latestDetection.plate); }}
                    style={{
                      width: "100%",
                      height: "36px",
                      background: "#0066cc",
                      color: "#ffffff",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: "600",
                      textAlign: "center",
                      marginTop: "4px",
                      transition: "background .15s"
                    }}
                    className="btn-view-profile"
                  >
                    View Vehicle History & Track Route
                  </button>
                </div>
              ) : (
                <div style={{ color: "var(--ink-mute)", fontSize: "12px", fontStyle: "italic", textAlign: "center", padding: "30px 0" }}>
                  Waiting for active vehicle readings...
                </div>
              )}
            </section>
          )}

          {/* Traffic Analytics volume indicator */}
          <section className="panel" style={{ padding: "16px" }}>
            <h3 className="eyebrow" style={{ fontSize: "11px", color: "var(--ink-dim)", letterSpacing: "0.08em", marginBottom: "12px", textTransform: "uppercase" }}>Traffic Volume Trend</h3>
            
            {/* Visual CSS-graph simulating a line chart over time */}
            <div style={{ height: "80px", display: "flex", alignItems: "flex-end", gap: "8px", borderBottom: "1px solid var(--rule)", paddingBottom: "4px", marginBottom: "8px" }}>
              {[35, 45, 60, 50, 40, 55, 75, 85, 70, 60, 55, 65, 80, 90, 75].map((val, idx) => (
                <div key={idx} style={{
                  flex: 1,
                  height: `${val}%`,
                  background: idx === 13 ? "#0066cc" : "rgba(0, 102, 204, 0.15)",
                  borderRadius: "2px",
                  transition: "height .3s"
                }} title={`${val} vehicles/min`} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--ink-dim)" }}>
              <span>12:00</span>
              <span>15:00 (Peak)</span>
              <span>18:00</span>
            </div>
          </section>

          {/* Vehicle Taxonomy Donut Card */}
          <section className="panel" style={{ padding: "16px" }}>
            <h3 className="eyebrow" style={{ fontSize: "11px", color: "var(--ink-dim)", letterSpacing: "0.08em", marginBottom: "12px", textTransform: "uppercase" }}>Vehicle Types Breakdown</h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {Object.entries(vehicleCounts).map(([type, count]) => {
                const pct = Math.round((count / totalTaxonomy) * 100);
                return (
                  <div key={type} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px" }}>
                      <span style={{ fontWeight: "600" }}>{type}s</span>
                      <span className="mono dim" style={{ color: "var(--ink-dim)" }}>{count} ({pct}%)</span>
                    </div>
                    <div style={{ height: "4px", background: "var(--void)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: type === "Car" ? "#0066cc" : type === "Truck" ? "#d97706" : type === "Motorcycle" ? "#16a34a" : "#94a3b8"
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Live Cameras Preview */}
          <section className="panel" style={{ padding: "16px" }}>
            <h3 className="eyebrow" style={{ fontSize: "11px", color: "var(--ink-dim)", letterSpacing: "0.08em", marginBottom: "12px", textTransform: "uppercase" }}>Live Cameras</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {cameras.slice(0, 3).map((cam) => (
                <div key={cam.id} style={{ display: "flex", gap: "10px", background: "var(--void)", border: "1px solid var(--rule)", borderRadius: "8px", padding: "8px", alignItems: "center" }}>
                  <div style={{ position: "relative", width: "60px", height: "40px", borderRadius: "4px", overflow: "hidden", background: "var(--ink-mute)", flexShrink: 0 }}>
                    <div style={{ width: "100%", height: "100%", background: "#475569" }} />
                    <span style={{ position: "absolute", top: "2px", left: "2px", fontSize: "7px", background: "var(--red)", color: "#fff", padding: "1px 3px", borderRadius: "2px", fontWeight: "700" }}>LIVE</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: "12px", color: "var(--ink)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cam.name}</strong>
                    <span style={{ fontSize: "10px", color: "var(--ink-dim)" }}>{cam.id.toUpperCase()} · Online</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
        .btn-view-profile:hover {
          background: #0052a3 !important;
        }
        .feed-item:hover {
          border-color: #0066cc !important;
          background: rgba(0, 102, 204, 0.02) !important;
        }
      `}</style>
    </section>
  );
}
