import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

export function StartupSequence({ state }) {
  const [loadProgress, setLoadProgress] = useState(0);
  const [matrixText, setMatrixText] = useState("");

  useEffect(() => {
    if (state !== "loading") return;
    
    // Progress bar simulation
    let val = 0;
    const interval = setInterval(() => {
      val += Math.random() * 5 + 2;
      if (val >= 100) {
        val = 100;
        clearInterval(interval);
      }
      setLoadProgress(val);
    }, 40);

    // Matrix glitch text simulation
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";
    const textInterval = setInterval(() => {
      let str = "";
      for (let i = 0; i < 20; i++) {
        str += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      setMatrixText(str);
    }, 50);

    return () => {
      clearInterval(interval);
      clearInterval(textInterval);
    };
  }, [state]);

  const title = "SYSTEM OVERRIDE";
  const subtitle = "INITIATING CORE NEURAL NETWORK...";
  const letters = Array.from(title);

  return (
    <div className="startup-overlay" style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "#050505", display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, overflow: "hidden", fontFamily: "'Share Tech Mono', monospace"
    }}>
      
      {/* Cyberpunk Grid Background */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "linear-gradient(rgba(0, 255, 170, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 170, 0.1) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        transform: "perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-200px)",
        animation: "gridMove 10s linear infinite",
        opacity: 0.4
      }} />

      {/* Heavy Glitch Vignette */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(circle at center, transparent 30%, #000 100%)",
        pointerEvents: "none", zIndex: 1
      }} />

      <AnimatePresence mode="wait">
        {state === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.5, filter: "blur(20px)" }} transition={{ duration: 0.5, ease: "easeInOut" }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 10, width: "600px" }}
          >
            {/* Spinning Tech Ring */}
            <div style={{ position: "relative", width: "300px", height: "300px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, ease: "linear", repeat: Infinity }}
                style={{
                  position: "absolute", inset: 0,
                  borderRadius: "50%",
                  border: "2px dashed #00ffaa",
                  opacity: 0.6,
                  boxShadow: "0 0 20px rgba(0, 255, 170, 0.4)"
                }}
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 6, ease: "linear", repeat: Infinity }}
                style={{
                  position: "absolute", inset: 20,
                  borderRadius: "50%",
                  border: "4px solid transparent",
                  borderTopColor: "#ff003c",
                  borderBottomColor: "#00e5ff",
                  opacity: 0.8,
                  filter: "blur(2px)"
                }}
              />
              <div style={{ fontSize: "42px", color: "#00ffaa", fontWeight: "bold", textShadow: "0 0 10px #00ffaa" }}>
                {Math.floor(loadProgress)}%
              </div>
            </div>

            {/* Matrix Text Loading */}
            <div style={{ marginTop: "40px", color: "#00e5ff", fontSize: "14px", letterSpacing: "4px", textAlign: "center" }}>
              <div>[ {matrixText} ]</div>
              <div style={{ marginTop: "10px", color: "#fff", textShadow: "0 0 8px #fff" }}>{subtitle}</div>
            </div>

            {/* Progress Bar */}
            <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.1)", marginTop: "20px", position: "relative", overflow: "hidden" }}>
              <motion.div
                style={{ height: "100%", background: "#00ffaa", width: `${loadProgress}%`, boxShadow: "0 0 15px #00ffaa" }}
              />
            </div>
          </motion.div>
        )}

        {state === "welcome" && (
          <motion.div key="welcome" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.2, filter: "blur(15px)" }} transition={{ duration: 0.8, type: "spring", bounce: 0.5 }}
            style={{ textAlign: "center", zIndex: 20 }}
          >
            {/* Cyberpunk Title Reveal */}
            <div style={{ display: "flex", justifyContent: "center", overflow: "hidden", padding: "20px" }}>
              {letters.map((letter, index) => (
                <motion.span
                  key={index}
                  initial={{ opacity: 0, y: 50, filter: "blur(10px)", color: "#ff003c" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)", color: "#00ffaa" }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.05,
                    ease: "circOut"
                  }}
                  style={{ 
                    display: "inline-block",
                    fontSize: "84px", 
                    fontWeight: "900",
                    letterSpacing: "6px",
                    marginRight: letter === " " ? "30px" : "0px",
                    textShadow: "0px 0px 20px rgba(0, 255, 170, 0.8), 0px 0px 40px rgba(0, 255, 170, 0.4)"
                  }}
                >
                  {letter}
                </motion.span>
              ))}
            </div>
            
            <motion.div
              initial={{ opacity: 0, scale: 2 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8, duration: 0.5, ease: "backOut" }}
              style={{ marginTop: "20px" }}
            >
              <span style={{ fontSize: "20px", color: "#fff", background: "#ff003c", padding: "5px 15px", letterSpacing: "10px", fontWeight: "bold", textTransform: "uppercase" }}>
                ACCESS GRANTED
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes gridMove {
          0% { background-position: 0 0; }
          100% { background-position: 0 40px; }
        }
      `}</style>
    </div>
  );
}
