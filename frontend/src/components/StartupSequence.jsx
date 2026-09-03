import { motion } from "framer-motion";

export function StartupSequence({ state }) {
  // state is either "loading" or "welcome"
  // When it's "loading", show the radar/spinner
  // When it's "welcome", show the welcome text

  return (
    <div className="startup-overlay" style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      background: "var(--void)", // existing theme color for deep background
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      overflow: "hidden"
    }}>
      
      {state === "loading" && (
        <motion.div
          key="loading"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}
        >
          {/* Radar / Pulse Animation */}
          <div style={{ position: "relative", width: "120px", height: "120px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <motion.div
              animate={{ 
                scale: [1, 1.5, 2],
                opacity: [0.8, 0.4, 0],
              }}
              transition={{
                duration: 2,
                ease: "linear",
                repeat: Infinity,
              }}
              style={{
                position: "absolute",
                width: "60px",
                height: "60px",
                border: "2px solid #0066cc",
                borderRadius: "50%",
              }}
            />
            <motion.div
              animate={{ 
                scale: [1, 1.5, 2],
                opacity: [0.8, 0.4, 0],
              }}
              transition={{
                duration: 2,
                ease: "linear",
                repeat: Infinity,
                delay: 1
              }}
              style={{
                position: "absolute",
                width: "60px",
                height: "60px",
                border: "2px solid #0066cc",
                borderRadius: "50%",
              }}
            />
            {/* Core dot */}
            <div style={{
              width: "24px",
              height: "24px",
              background: "#0066cc",
              borderRadius: "50%",
              boxShadow: "0 0 20px #0066cc, 0 0 40px #0066cc",
              zIndex: 10
            }} />
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <h2 className="mono" style={{ fontSize: "14px", color: "var(--ink-mute)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
              Initializing System
            </h2>
            <div style={{ display: "flex", gap: "4px" }}>
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                  style={{ width: "6px", height: "6px", background: "var(--cyan-soft)", borderRadius: "50%" }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {state === "welcome" && (
        <motion.div
          key="welcome"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ textAlign: "center" }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }}
          >
            <h1 style={{ 
              fontSize: "48px", 
              fontWeight: "800", 
              background: "linear-gradient(135deg, #0066cc, #38bdf8)", 
              WebkitBackgroundClip: "text", 
              WebkitTextFillColor: "transparent",
              marginBottom: "16px",
              letterSpacing: "-0.02em"
            }}>
              TrafficPulse AI
            </h1>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            style={{ fontSize: "16px", color: "var(--ink-dim)", letterSpacing: "0.05em" }}
          >
            City-Wide Intelligence Engine
          </motion.p>
        </motion.div>
      )}
    </div>
  );
}
