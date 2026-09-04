import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

export function StartupSequence({ state }) {
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    if (state !== "loading") return;
    let val = 0;
    const interval = setInterval(() => {
      val += Math.random() * 2 + 1;
      if (val >= 100) {
        val = 100;
        clearInterval(interval);
      }
      setLoadProgress(val);
    }, 40);
    return () => clearInterval(interval);
  }, [state]);

  const title = "TRAFFIC PULSE";
  const letters = Array.from(title);

  return (
    <div className="startup-overlay" style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "#000000", display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, overflow: "hidden", fontFamily: "'Inter', sans-serif"
    }}>
      
      {/* Ambient Deep Background Glow */}
      <motion.div
        animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.1, 1] }}
        transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
        style={{
          position: "absolute",
          width: "150vw", height: "150vh",
          background: "radial-gradient(circle at center, rgba(14, 165, 233, 0.05) 0%, transparent 60%)",
          pointerEvents: "none"
        }}
      />

      <AnimatePresence mode="wait">
        {state === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.1, filter: "blur(20px)" }} transition={{ duration: 0.8, ease: "easeInOut" }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 10 }}
          >
            {/* Cinematic Glowing Orb */}
            <div style={{ position: "relative", width: "200px", height: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <motion.div
                animate={{ rotate: 360, scale: [1, 1.05, 1] }}
                transition={{ rotate: { duration: 8, ease: "linear", repeat: Infinity }, scale: { duration: 3, ease: "easeInOut", repeat: Infinity } }}
                style={{
                  position: "absolute", inset: 0,
                  borderRadius: "50%",
                  background: "conic-gradient(from 180deg at 50% 50%, rgba(14, 165, 233, 0) 0%, rgba(14, 165, 233, 0.8) 50%, rgba(14, 165, 233, 0) 100%)",
                  filter: "blur(8px)",
                  opacity: 0.8
                }}
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 12, ease: "linear", repeat: Infinity }}
                style={{
                  position: "absolute", inset: 20,
                  borderRadius: "50%",
                  background: "conic-gradient(from 0deg at 50% 50%, rgba(56, 189, 248, 0) 0%, rgba(224, 242, 254, 0.5) 50%, rgba(56, 189, 248, 0) 100%)",
                  filter: "blur(4px)",
                }}
              />
              {/* Inner dark core */}
              <div style={{
                position: "absolute", inset: 35,
                borderRadius: "50%", background: "#000000",
                boxShadow: "inset 0 0 20px rgba(14, 165, 233, 0.5)"
              }} />
            </div>

            {/* Premium minimal loading text */}
            <div style={{ marginTop: "40px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "12px", letterSpacing: "8px", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", fontWeight: 400 }}>
                Initializing Engine
              </span>
              <div style={{ width: "160px", height: "1px", background: "rgba(255,255,255,0.1)", position: "relative", overflow: "hidden" }}>
                <motion.div
                  style={{ height: "100%", background: "#38bdf8", width: `${loadProgress}%`, boxShadow: "0 0 10px #38bdf8" }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {state === "welcome" && (
          <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.05, filter: "blur(15px)" }} transition={{ duration: 1.2, ease: "easeInOut" }}
            style={{ textAlign: "center", zIndex: 20 }}
          >
            {/* Cinematic Logo Reveal */}
            <div style={{ display: "flex", overflow: "hidden", padding: "20px" }}>
              {letters.map((letter, index) => (
                <motion.span
                  key={index}
                  initial={{ opacity: 0, filter: "blur(20px)", scale: 1.2 }}
                  animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                  transition={{
                    duration: 1.2,
                    delay: index * 0.05 + 0.2,
                    ease: [0.16, 1, 0.3, 1]
                  }}
                  style={{ 
                    display: "inline-block",
                    fontSize: "72px", 
                    fontWeight: "300", // Sleeker, thinner premium font look
                    color: "#ffffff",
                    letterSpacing: "4px",
                    marginRight: letter === " " ? "24px" : "4px",
                    textShadow: "0 0 30px rgba(255,255,255,0.3)"
                  }}
                >
                  {letter}
                </motion.span>
              ))}
            </div>
            
            <motion.div
              initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 1.2, duration: 1.5, ease: "easeOut" }}
              style={{ marginTop: "10px" }}
            >
              <span style={{ fontSize: "12px", color: "rgba(14, 165, 233, 0.8)", letterSpacing: "12px", textTransform: "uppercase", fontWeight: "500" }}>
                AI Vision Platform
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
