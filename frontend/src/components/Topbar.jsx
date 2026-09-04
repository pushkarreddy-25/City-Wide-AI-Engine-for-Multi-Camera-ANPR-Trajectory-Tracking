import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { fmtTime } from "../services/format.js";
import { apiUrl } from "../services/api.js";

const STATUS_LABEL = { live: "Live", connecting: "Connecting", down: "Reconnecting" };

export function Topbar({ status, stats, theme, toggleTheme }) {
  const navigate = useNavigate();
  const [searchVal, setSearchVal] = useState("");
  const [localTime, setLocalTime] = useState("");
  const [sysMode, setSysMode] = useState("simulation");
  const [modeLoading, setModeLoading] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/system/mode"))
      .then(r => r.json())
      .then(d => setSysMode(d.mode || "simulation"))
      .catch(console.error);
  }, []);

  const toggleMode = async () => {
    if (modeLoading) return;
    const newMode = sysMode === "simulation" ? "production" : "simulation";
    setModeLoading(true);
    try {
      const res = await fetch(apiUrl("/system/mode"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode })
      });
      const data = await res.json();
      if (data.status === "ok") {
        setSysMode(data.mode);
        // Dispatch custom event to notify other components to refresh or reset
        window.dispatchEvent(new Event("systemModeChanged"));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setModeLoading(false);
    }
  };

  // Clock updating local time in a premium HH:MM:SS format
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
      <div className="brand" style={{ padding: "0 20px", display: "flex", flexDirection: "column", justifyContent: "center", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div className="pulse-dot" style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#0066cc", boxShadow: "0 0 8px #0066cc" }}></div>
          <span className="brand-name" style={{ fontSize: "16px", fontWeight: "700", color: "var(--ink)", letterSpacing: "-0.01em" }}>
            TrafficPulse <span style={{ color: "#0066cc" }}>AI</span>
          </span>
        </div>
        <span className="brand-sub" style={{ fontSize: "9.5px", fontWeight: "600", color: "var(--ink-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: "2px" }}>
          ANPR · Traffic Intelligence
        </span>
      </div>

      <header className="topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", borderBottom: "1px solid var(--rule)" }}>
        {/* Global Search Bar */}
        <form onSubmit={handleSearch} className="global-search-form" style={{ width: "360px", position: "relative" }}>
          <svg viewBox="0 0 24 24" style={{ width: "16px", height: "16px", position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fill: "var(--ink-mute)" }}>
            <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
          </svg>
          <input
            type="text"
            placeholder="Search plate, vehicle, camera, location..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            style={{
              width: "100%",
              height: "36px",
              padding: "0 16px 0 38px",
              background: "var(--void)",
              border: "1px solid var(--rule)",
              borderRadius: "8px",
              fontSize: "12.5px",
              color: "var(--ink)",
              outline: "none",
              transition: "border-color .15s"
            }}
            className="header-search-input"
          />
        </form>

        <div className="topbar-meta" style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div className="meta-item">
            <span className="meta-label">Local Time</span>
            <span className="meta-val mono" style={{ fontWeight: "600" }}>{localTime || "--:--:--"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Sim Clock</span>
            <span className="meta-val mono" style={{ fontWeight: "600" }}>{stats?.sim_time ? fmtTime(stats.sim_time) : "--:--:--"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Fleet</span>
            <span className="meta-val mono" style={{ fontWeight: "600" }}>{stats?.fleet_size ?? "—"}</span>
          </div>
          <div className="conn" data-state={status} style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--void)", border: "1px solid var(--rule)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", textTransform: "capitalize" }}>
            <span className="conn-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: status === "live" ? "var(--green)" : "var(--amber)" }} />
            <span style={{ color: "var(--ink-dim)" }}>{STATUS_LABEL[status] || status}</span>
          </div>

          {/* Mode Toggle Button */}
          <button 
            onClick={toggleMode}
            disabled={modeLoading}
            style={{ 
              display: "flex", alignItems: "center", gap: "6px",
              padding: "4px 10px", 
              borderRadius: "6px", 
              background: modeLoading ? "var(--void)" : (sysMode === "simulation" ? "rgba(255,176,32,0.1)" : "rgba(0,255,0,0.1)"), 
              border: `1px solid ${sysMode === "simulation" ? "var(--amber)" : "var(--green)"}`, 
              fontSize: "10.5px", fontWeight: "700", 
              color: sysMode === "simulation" ? "var(--amber)" : "var(--green)",
              cursor: modeLoading ? "wait" : "pointer",
              transition: "all 0.2s"
            }}
            title={sysMode === "simulation" ? "Switch to Real AI Inference" : "Switch to Fake Traffic Simulation"}
          >
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: sysMode === "simulation" ? "var(--amber)" : "var(--green)", animation: modeLoading ? "pulse 1s infinite" : "none" }}></div>
            {modeLoading ? "SWITCHING..." : sysMode.toUpperCase()}
          </button>

          {/* Theme Toggle Button */}
          <button 
            onClick={toggleTheme}
            style={{ position: "relative", width: "36px", height: "36px", borderRadius: "50%", background: "var(--void)", border: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "center" }} 
            aria-label="Toggle Theme" 
            className="header-icon-btn"
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" style={{ width: "18px", height: "18px", fill: "var(--amber)" }}>
                <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.758a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" style={{ width: "18px", height: "18px", fill: "var(--ink-dim)" }}>
                <path d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" />
              </svg>
            )}
          </button>

          {/* Notifications Button */}
          <button 
            onClick={() => navigate('/violations')}
            style={{ position: "relative", width: "36px", height: "36px", borderRadius: "50%", background: "var(--void)", border: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "center" }} 
            aria-label="Notifications" 
            className="header-icon-btn"
          >
            <svg viewBox="0 0 24 24" style={{ width: "18px", height: "18px", fill: "var(--ink-dim)" }}>
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
            </svg>
            <span style={{ position: "absolute", top: "8px", right: "8px", width: "6px", height: "6px", borderRadius: "50%", background: "var(--red)" }}></span>
          </button>

          {/* User Profile */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }} className="header-profile">
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#e0efff", border: "1.5px solid #0066cc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11.5px", fontWeight: "700", color: "#0066cc" }}>
              OP
            </div>
            <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }} className="profile-text">
              <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--ink)" }}>Operator</span>
              <span style={{ fontSize: "10px", color: "var(--ink-dim)" }}>Nagpur HQ</span>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
