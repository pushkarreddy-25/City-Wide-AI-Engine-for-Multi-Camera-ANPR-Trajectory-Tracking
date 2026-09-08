import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fmtTime } from "../services/format.js";
import { apiUrl, api } from "../services/api.js";

const STATUS_LABEL = { live: "Live Stream", connecting: "Connecting", down: "Offline" };

export function Topbar({ status, stats, theme, toggleTheme, onOpenSearch }) {
  const navigate = useNavigate();
  const [searchVal, setSearchVal] = useState("");
  const [localTime, setLocalTime] = useState("");
  const [sysMode, setSysMode] = useState("simulation");
  const [modeLoading, setModeLoading] = useState(false);
  const [cameraConnected, setCameraConnected] = useState(
    localStorage.getItem("cameraConnected") === "true"
  );

  useEffect(() => {
    api.getMode()
      .then(d => setSysMode(d?.mode || "simulation"))
      .catch(console.error);
  }, []);

  const toggleMode = async () => {
    if (modeLoading) return;
    const newMode = sysMode === "simulation" ? "production" : "simulation";
    
    setModeLoading(true);
    try {
      const data = await api.setMode(newMode);
      if (data && data.status === "ok") {
        setSysMode(data.mode);
        window.dispatchEvent(new Event("systemModeChanged"));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setModeLoading(false);
    }
  };


  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLocalTime(now.toLocaleTimeString("en-US", { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchVal.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchVal.trim())}`);
      setSearchVal("");
    }
  };

  return (
    <>
      <div className="brand" style={{ padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div className="brand-mark" />
          <span className="brand-name">
            Traffic Operations
            <b>City ANPR Control System</b>
          </span>
        </div>
      </div>

      <header className="topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: "1px solid var(--rule)" }}>
        {/* Global Search Bar */}
        <form onSubmit={handleSearch} className="global-search-form" style={{ width: "340px", position: "relative" }}>
          <svg viewBox="0 0 24 24" style={{ width: "15px", height: "15px", position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fill: "var(--ink-mute)" }}>
            <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
          </svg>
          <input
            type="text"
            placeholder="Search license plate, vehicle, or camera... (Ctrl+K)"
            value={searchVal}
            onClick={onOpenSearch}
            onChange={(e) => setSearchVal(e.target.value)}
            style={{
              width: "100%",
              height: "34px",
              padding: "0 12px 0 34px",
              background: "var(--void)",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r)",
              fontSize: "12.5px",
              color: "var(--ink)",
              outline: "none"
            }}
            className="header-search-input"
          />
        </form>

        <div className="topbar-meta" style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div className="meta-item">
            <span className="meta-label">Local Time</span>
            <span className="meta-val">{localTime || "--:--:--"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Sim Time</span>
            <span className="meta-val">{stats?.sim_time ? fmtTime(stats.sim_time) : "--:--:--"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Active Fleet</span>
            <span className="meta-val">{stats?.fleet_size ?? "—"}</span>
          </div>
          
          <div className="conn" data-state={status}>
            <span className="conn-dot" />
            <span>{STATUS_LABEL[status] || status}</span>
          </div>

          <button
            onClick={() => {
              const newState = !cameraConnected;
              setCameraConnected(newState);
              localStorage.setItem("cameraConnected", newState.toString());
            }}
            className="btn btn-sm"
            style={{
              borderColor: cameraConnected ? "var(--green)" : "var(--rule-hi)",
              color: cameraConnected ? "var(--green)" : "var(--ink-dim)"
            }}
            title="Connect / Disconnect Camera Feed"
          >
            {cameraConnected ? "Camera Feed Live" : "Connect Camera"}
          </button>

          <button 
            onClick={toggleMode}
            disabled={modeLoading}
            className="btn btn-sm"
            style={{ 
              borderColor: sysMode === "simulation" ? "var(--amber)" : "var(--green)",
              color: sysMode === "simulation" ? "var(--amber)" : "var(--green)"
            }}
            title={sysMode === "simulation" ? "Switch to Real AI Inference" : "Switch to Traffic Simulation"}
          >
            {modeLoading ? "Switching..." : (sysMode === "simulation" ? "Simulation Mode" : "Production AI")}
          </button>

          <button 
            onClick={toggleTheme}
            style={{ width: "32px", height: "32px", borderRadius: "var(--r)", background: "var(--void)", border: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "center" }} 
            aria-label="Toggle Theme" 
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" style={{ width: "15px", height: "15px", fill: "var(--ink-dim)" }}>
                <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.758a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" style={{ width: "15px", height: "15px", fill: "var(--ink-dim)" }}>
                <path d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" />
              </svg>
            )}
          </button>

          <button 
            onClick={() => navigate('/violations')}
            style={{ position: "relative", width: "32px", height: "32px", borderRadius: "var(--r)", background: "var(--void)", border: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "center" }} 
            aria-label="Alerts" 
          >
            <svg viewBox="0 0 24 24" style={{ width: "15px", height: "15px", fill: "var(--ink-dim)" }}>
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
            </svg>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "30px", height: "30px", borderRadius: "var(--r)", background: "var(--cyan-wash)", border: "1px solid var(--cyan-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11.5px", fontWeight: "700", color: "var(--cyan-soft)" }}>
              OP
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--ink)" }}>Operator</span>
              <span style={{ fontSize: "10.5px", color: "var(--ink-mute)" }}>Nagpur Control Center</span>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
