import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

// A high-tech background grid effect
const GridBackground = () => (
  <div style={{ position: "absolute", inset: 0, opacity: 0.15, pointerEvents: "none", overflow: "hidden" }}>
    <div style={{
      position: "absolute",
      inset: -50,
      backgroundSize: "40px 40px",
      backgroundImage: `
        linear-gradient(to right, rgba(0, 102, 204, 0.4) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0, 102, 204, 0.4) 1px, transparent 1px)
      `,
      maskImage: "radial-gradient(circle at center, black 20%, transparent 80%)",
      WebkitMaskImage: "radial-gradient(circle at center, black 20%, transparent 80%)",
      transform: "perspective(500px) rotateX(45deg) scale(1.5)",
      transformOrigin: "center 80%"
    }} />
  </div>
);

export function StartupSequence({ state }) {
  // state is "loading" (0-2.5s) or "welcome" (2.5-5.0s)
  
  // Cycle through high-tech loading phases
  const [loadText, setLoadText] = useState("Initializing Core Systems");
  
  useEffect(() => {
    if (state !== "loading") return;
    const t1 = setTimeout(() => setLoadText("Connecting to Traffic Grid..."), 700);
    const t2 = setTimeout(() => setLoadText("Calibrating ANPR Engines..."), 1400);
    const t3 = setTimeout(() => setLoadText("Establishing Secure Uplink..."), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [state]);

  const welcomeText = "TrafficPulse AI";
  const letters = Array.from(welcomeText);

  return (
    <div className="startup-overlay" style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      background: "radial-gradient(circle at center, #0a1118 0%, #03060a 100%)", // deeper premium dark background
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      overflow: "hidden"
    }}>
      <GridBackground />
      
      <AnimatePresence mode="wait">
        {state === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: "blur(12px)" }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "32px", position: "relative" }}
          >
            {/* Advanced Radar / Pulse Animation */}
            <div style={{ position: "relative", width: "160px", height: "160px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              
              {/* Outer rotating scanner ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, ease: "linear", repeat: Infinity }}
                style={{
                  position: "absolute",
                  width: "140px",
                  height: "140px",
                  border: "1px dashed rgba(0, 102, 204, 0.4)",
                  borderRadius: "50%",
                }}
              />

              {/* Pulsing rings */}
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    scale: [1, 2, 2.5],
                    opacity: [0.8, 0.2, 0],
                    borderWidth: ["2px", "1px", "0px"]
                  }}
                  transition={{
                    duration: 2.5,
                    ease: "cubicBezier(0.1, 0.7, 1.0, 0.1)",
                    repeat: Infinity,
                    delay: i * 0.8
                  }}
                  style={{
                    position: "absolute",
                    width: "48px",
                    height: "48px",
                    borderStyle: "solid",
                    borderColor: "#0066cc",
                    borderRadius: "50%",
                  }}
                />
              ))}

              {/* Core glowing orb */}
              <motion.div 
                animate={{ scale: [1, 1.1, 1], boxShadow: ["0 0 20px #0066cc", "0 0 40px #38bdf8", "0 0 20px #0066cc"] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  width: "28px",
                  height: "28px",
                  background: "linear-gradient(135deg, #38bdf8, #0066cc)",
                  borderRadius: "50%",
                  zIndex: 10
                }} 
              />
            </div>
            
            {/* Dynamic loading text */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", height: "40px" }}>
              <AnimatePresence mode="wait">
                <motion.h2
                  key={loadText}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="mono"
                  style={{ fontSize: "14px", color: "var(--cyan-soft)", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: "600", textShadow: "0 0 10px rgba(0,102,204,0.5)" }}
                >
                  {loadText}
                </motion.h2>
              </AnimatePresence>

              {/* Processing bar */}
              <div style={{ width: "120px", height: "2px", background: "rgba(0,102,204,0.2)", borderRadius: "2px", overflow: "hidden", position: "relative" }}>
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  style={{ position: "absolute", top: 0, bottom: 0, width: "50%", background: "var(--cyan-soft)", boxShadow: "0 0 10px var(--cyan)" }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {state === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}
          >
            <div style={{ display: "flex", overflow: "hidden", padding: "10px 0" }}>
              {letters.map((letter, index) => (
                <motion.span
                  key={index}
                  initial={{ opacity: 0, y: 40, rotateX: -90 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={{
                    duration: 0.7,
                    delay: index * 0.05,
                    type: "spring",
                    stiffness: 150,
                    damping: 12
                  }}
                  style={{ 
                    display: "inline-block",
                    fontSize: "56px", 
                    fontWeight: "800", 
                    background: "linear-gradient(135deg, #ffffff 0%, #a5f3fc 50%, #0066cc 100%)",
                    WebkitBackgroundClip: "text", 
                    WebkitTextFillColor: "transparent",
                    letterSpacing: "-0.03em",
                    textShadow: "0 10px 30px rgba(0,102,204,0.3)"
                  }}
                >
                  {letter === " " ? "\u00A0" : letter}
                </motion.span>
              ))}
            </div>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8, duration: 0.8, ease: "easeOut" }}
              style={{ display: "flex", alignItems: "center", gap: "12px" }}
            >
              <div style={{ width: "30px", height: "1px", background: "linear-gradient(90deg, transparent, var(--cyan))" }} />
              <p className="mono" style={{ fontSize: "14px", color: "var(--cyan-dim)", letterSpacing: "0.25em", textTransform: "uppercase" }}>
                City-Wide Intelligence Engine
              </p>
              <div style={{ width: "30px", height: "1px", background: "linear-gradient(-90deg, transparent, var(--cyan))" }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
