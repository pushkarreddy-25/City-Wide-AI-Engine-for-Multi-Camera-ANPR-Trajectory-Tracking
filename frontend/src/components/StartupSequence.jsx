import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

const TEAL = "#00e5d0";

// Custom fluid easing for ultra-smooth cinematic motion
const fluidEase = [0.22, 1, 0.36, 1];

const stages = [
  {
    duration: 1200,
    title: "SYSTEM INITIATING",
    status: "ACTIVATING CAMERAS..."
  },
  {
    duration: 1400,
    title: "SCANNING ENVIRONMENT",
    status: "ANALYSING TRAFFIC..."
  },
  {
    duration: 1500,
    title: "VEHICLE DETECTED",
    status: "TRACKING VEHICLE..."
  },
  {
    duration: 1200,
    title: "LOCATING NUMBER PLATE",
    status: "PLATE DETECTION..."
  },
  {
    duration: 1400,
    title: "PROCESSING PLATE",
    status: "EXTRACTING CHARACTERS..."
  },
  {
    duration: 1500,
    title: "RECOGNIZING CHARACTERS",
    status: "RUNNING OCR..."
  },
  {
    duration: 1400,
    title: "DATA SYNC",
    status: "SYNCHRONIZING DATABASE..."
  },
  {
    duration: 1600,
    title: "INITIALIZATION COMPLETE",
    status: "ALL SYSTEMS NOMINAL"
  }
];

export function StartupSequence({ state }) {
  const [stage, setStage] = useState(0);
  const [plateText, setPlateText] = useState("");

  useEffect(() => {
    if (state !== "loading") return;

    setStage(0);
    setPlateText("");

    let timer;
    let current = 0;

    const nextStage = () => {
      if (current >= stages.length - 1) return;

      timer = setTimeout(() => {
        current += 1;
        setStage(current);
        nextStage();
      }, stages[current].duration);
    };

    nextStage();

    return () => clearTimeout(timer);
  }, [state]);

  // OCR character-by-character reveal
  useEffect(() => {
    if (stage !== 5) {
      setPlateText("");
      return;
    }

    const target = "MH 27 AB 1234";
    let index = 0;

    const interval = setInterval(() => {
      index++;
      setPlateText(target.substring(0, index));
      if (index >= target.length) {
        clearInterval(interval);
      }
    }, 90);

    return () => clearInterval(interval);
  }, [stage]);

  return (
    <AnimatePresence mode="wait">
      {state && (
        <motion.div
          key={state}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: 1.05,
            filter: "blur(15px)"
          }}
          transition={{ duration: 1, ease: fluidEase }}
          style={styles.container}
        >

          {/* =================================================
              TOP CAMERA HUD
          ================================================= */}

          <div style={styles.topBar}>
            <div>
              <span style={styles.dot} />
              ANPR // CAMERA 01
            </div>
            <div>
              LIVE FEED&nbsp;&nbsp; • &nbsp;&nbsp;CITY GRID
            </div>
          </div>

          <div style={styles.stageTitle}>
            <span style={{ opacity: 0.5 }}>{String(stage + 1).padStart(2, "0")}</span> {stages[stage]?.title}
          </div>

          {/* =================================================
              MAIN CINEMATIC SCENE
          ================================================= */}

          {/* Removed mode="wait" so stages crossfade smoothly without a black flash */}
          <AnimatePresence>

            {/* -----------------------------------------------
                STAGE 0 — CAMERA ACTIVATION
            ------------------------------------------------ */}
            {stage === 0 && (
              <motion.div
                key="camera"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                style={styles.scene}
              >
                {/* Ken Burns subtle zoom on the background */}
                <motion.img 
                  src="/camera_bg_1788597605901.jpg" 
                  initial={{ scale: 1.08 }} 
                  animate={{ scale: 1 }} 
                  transition={{ duration: 8, ease: "easeOut" }}
                  style={styles.fullscreenBg} 
                />
                <div style={styles.vignette} />

                <motion.div
                  initial={{ opacity: 0, y: 30, filter: "blur(5px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: 0.4, duration: 0.8, ease: fluidEase }}
                  style={styles.statusBox}
                >
                  <div>ACTIVATING CAMERAS...</div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>INITIALIZING AI MODULES...</motion.div>
                  <motion.div
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    style={{...styles.ready, opacity: 0}}
                  >
                    READY.
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {/* -----------------------------------------------
                STAGE 1 — ROAD SCANNING
            ------------------------------------------------ */}
            {stage === 1 && (
              <motion.div
                key="road"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                style={styles.scene}
              >
                <motion.img 
                  src="/road_bg_1788597861335.jpg" 
                  initial={{ scale: 1.08 }} 
                  animate={{ scale: 1 }} 
                  transition={{ duration: 8, ease: "easeOut" }}
                  style={styles.fullscreenBg} 
                />
                <div style={styles.vignette} />
                
                <motion.div
                  initial={{ opacity: 0, scale: 1.1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, ease: fluidEase }}
                >
                  <DetectionCorners />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.8, ease: fluidEase }}
                  style={styles.scanText}
                >
                  ANALYSING TRAFFIC...
                  <br />
                  DETECTING VEHICLES...
                  <div style={styles.loadingDots}>
                    <span>•</span><span>•</span><span>•</span>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* -----------------------------------------------
                STAGE 2 — VEHICLE DETECTED
            ------------------------------------------------ */}
            {stage === 2 && (
              <motion.div
                key="vehicle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                style={styles.scene}
              >
                <motion.img 
                  src="/car_approach_1788597874628.jpg" 
                  initial={{ scale: 1.05 }} 
                  animate={{ scale: 1 }} 
                  transition={{ duration: 6, ease: "easeOut" }}
                  style={styles.fullscreenBg} 
                />
                <div style={styles.vignette} />

                <motion.div
                  initial={{ opacity: 0, scale: 1.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", mass: 0.8, stiffness: 200, damping: 20 }}
                  style={styles.vehicleBox}
                >
                  <div style={styles.vehicleLabel}>
                    VEHICLE DETECTED
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 15 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ delay: 0.2, duration: 0.8, ease: fluidEase }}
                  style={styles.trackingText}
                >
                  TRACKING...
                  <br />
                  APPROACHING...
                </motion.div>
              </motion.div>
            )}

            {/* -----------------------------------------------
                STAGE 3 — PLATE DETECTION
            ------------------------------------------------ */}
            {stage === 3 && (
              <motion.div
                key="plate"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                style={styles.scene}
              >
                <motion.img 
                  src="/car_plate_zoom_1788597919881.jpg" 
                  initial={{ scale: 1.05 }} 
                  animate={{ scale: 1 }} 
                  transition={{ duration: 6, ease: "easeOut" }}
                  style={styles.fullscreenBg} 
                />
                <div style={styles.vignette} />

                <motion.div
                  initial={{ scale: 1.8, opacity: 0, filter: "blur(10px)" }}
                  animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                  transition={{ duration: 0.9, ease: fluidEase }}
                  style={styles.plateBox}
                >
                  <div style={styles.plate}>
                    MH 27 AB 1234
                  </div>
                </motion.div>

                <motion.div
                  animate={{ y: [-25, 25] }}
                  transition={{ duration: 1.2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                  style={styles.plateScanner}
                />

                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4, duration: 0.8, ease: fluidEase }}
                  style={styles.bottomStatus}
                >
                  PLATE DETECTION...
                  <br />
                  ZOOMING...
                </motion.div>
              </motion.div>
            )}

            {/* -----------------------------------------------
                STAGE 4 — PLATE PROCESSING
            ------------------------------------------------ */}
            {stage === 4 && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                style={styles.scene}
              >
                <motion.img 
                  src="/plate_extreme_zoom_1788598033735.jpg" 
                  initial={{ scale: 1.05 }} 
                  animate={{ scale: 1 }} 
                  transition={{ duration: 6, ease: "easeOut" }}
                  style={styles.fullscreenBg} 
                />
                <div style={styles.vignette} />

                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, ease: fluidEase }}
                >
                  <motion.div
                    animate={{ boxShadow: [`0 0 10px ${TEAL}`, `0 0 50px ${TEAL}`, `0 0 10px ${TEAL}`] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    style={styles.bigPlateBox}
                  >
                    <div style={styles.bigPlate}>
                      MH 27 AB 1234
                    </div>
                  </motion.div>
                </motion.div>

                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1.2, ease: fluidEase }}
                  style={styles.horizontalScan}
                />

                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.8, ease: fluidEase }}
                  style={styles.processingText}
                >
                  ENHANCING IMAGE...
                  <br />
                  EXTRACTING CHARACTERS...
                </motion.div>
              </motion.div>
            )}

            {/* -----------------------------------------------
                STAGE 5 — OCR
            ------------------------------------------------ */}
            {stage === 5 && (
              <motion.div
                key="ocr"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                style={styles.scene}
              >
                <motion.img 
                  src="/plate_extreme_zoom_1788598033735.jpg" 
                  initial={{ scale: 1.05, filter: "blur(5px) brightness(0.6)" }} 
                  animate={{ scale: 1, filter: "blur(12px) brightness(0.3)" }} 
                  transition={{ duration: 6, ease: "easeOut" }}
                  style={styles.fullscreenBg} 
                />
                
                <div style={styles.ocrLayout}>
                  <motion.div 
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, ease: fluidEase }}
                    style={styles.ocrImage}
                  >
                    <img src="/plate_extreme_zoom_1788598033735.jpg" style={{width: "100%", height: "100%", objectFit: "cover", position: "absolute", zIndex: 0, opacity: 0.6}} />
                    <div style={{...styles.ocrPlate, position: "relative", zIndex: 1}}>
                      {plateText || "MH 27 AB 1234"}
                    </div>
                    <motion.div
                      animate={{ y: [-45, 45] }}
                      transition={{ duration: 1.2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                      style={{...styles.ocrScan, zIndex: 2}}
                    />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2, duration: 0.8, ease: fluidEase }}
                    style={styles.resultPanel}
                  >
                    <div style={styles.resultTitle}>RESULT</div>
                    <div style={styles.resultPlate}>{plateText || "SCANNING..."}</div>
                    
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                      <ResultRow label="VEHICLE TYPE" value="Car" />
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                      <ResultRow label="MAKE" value="Hyundai" />
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                      <ResultRow label="COLOR" value="Black" />
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
                      <ResultRow label="CONFIDENCE" value="99.8%" />
                    </motion.div>
                  </motion.div>
                </div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.8, ease: fluidEase }}
                  style={styles.ocrStatus}
                >
                  <div>│ RUNNING OCR...</div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>│ VALIDATING...</motion.div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0.4, 1] }}
                    transition={{ delay: 0.9, duration: 2, repeat: Infinity }}
                    style={{ color: TEAL }}
                  >
                    │ PLATE RECOGNIZED
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {/* -----------------------------------------------
                STAGE 6 — DATABASE SYNC
            ------------------------------------------------ */}
            {stage === 6 && (
              <motion.div
                key="sync"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                style={styles.scene}
              >
                <motion.img 
                  src="/car_approach_1788597874628.jpg" 
                  initial={{ scale: 1.05, filter: "blur(2px) brightness(0.4)" }} 
                  animate={{ scale: 1, filter: "blur(8px) brightness(0.3)" }} 
                  transition={{ duration: 6, ease: "easeOut" }}
                  style={styles.fullscreenBg} 
                />

                <div style={styles.syncLayout}>
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, x: -20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    transition={{ duration: 0.8, ease: fluidEase }}
                    style={{width: 330, height: 220, position: "relative", overflow: "hidden", border: `1px solid ${TEAL}`}}
                  >
                     <img src="/car_approach_1788597874628.jpg" style={{width: "100%", height: "100%", objectFit: "cover"}} />
                     <div style={{position: "absolute", bottom: 15, left: 15, background: "#cfcfcf", color: "#000", padding: "2px 8px", fontSize: 10, fontWeight: "bold", fontFamily: "monospace"}}>MH 27 AB 1234</div>
                     {/* Scanning line over car image */}
                     <motion.div
                       animate={{ y: ["0%", "100%"] }}
                       transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                       style={{ position: "absolute", top: 0, width: "100%", height: 2, background: "rgba(0,229,208,0.5)", boxShadow: `0 0 10px ${TEAL}` }}
                     />
                  </motion.div>

                  <motion.div 
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2, duration: 0.8, ease: fluidEase }}
                    style={styles.syncPanel}
                  >
                    <div style={styles.syncTitle}>SYNCHRONIZING WITH DATABASE...</div>
                    <SyncRow text="PLATE VERIFIED" delay={0.4} />
                    <SyncRow text="VEHICLE MATCHED" delay={0.6} />
                    <SyncRow text="LOGGING ENTRY" delay={0.8} />
                    <SyncRow text="SYNC COMPLETE" delay={1.0} />
                  </motion.div>
                </div>
              </motion.div>
            )}

            {/* -----------------------------------------------
                STAGE 7 — LOGO REVEAL
            ------------------------------------------------ */}
            {stage === 7 && (
              <motion.div
                key="logo"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.5, ease: fluidEase }}
                style={styles.logoScene}
              >
                <motion.img 
                  src="/network_bg_1788598174786.jpg" 
                  initial={{ scale: 1.1 }} 
                  animate={{ scale: 1 }} 
                  transition={{ duration: 10, ease: "easeOut" }}
                  style={styles.fullscreenBg} 
                />
                <div style={styles.vignette} />

                {/* Light burst behind logo */}
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 2, 3], opacity: [0, 0.4, 0] }}
                  transition={{ duration: 2.5, ease: "easeOut" }}
                  style={{
                    position: "absolute",
                    width: 250, height: 250,
                    background: `radial-gradient(circle, ${TEAL} 0%, transparent 70%)`,
                    filter: "blur(20px)",
                    zIndex: 0
                  }}
                />

                <motion.h1
                  initial={{ opacity: 0, scale: 0.9, letterSpacing: "25px", filter: "blur(15px)" }}
                  animate={{ opacity: 1, scale: 1, letterSpacing: "10px", filter: "blur(0px)" }}
                  transition={{ duration: 1.5, ease: fluidEase }}
                  style={styles.logo}
                >
                  <span>ANPR</span>
                  <b style={{color: "rgba(255,255,255,0.2)", margin: "0 10px"}}>/</b>
                  <strong style={{color: TEAL, textShadow: `0 0 15px ${TEAL}`}}>ENGINE</strong>
                </motion.h1>

                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 1, ease: fluidEase }}
                  style={styles.subtitle}
                >
                  CITY-WIDE INTELLIGENCE GRID
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.4, duration: 1 }}
                  style={styles.online}
                >
                  <motion.span
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    ●
                  </motion.span> LOADING APPLICATION...
                </motion.div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* =================================================
              FOOTER
          ================================================= */}

          <div style={styles.footer}>
            <span>ANPR ENGINE // v2.7.04</span>
            <span>SECURE UPLINK</span>
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ============================================================
   DETECTION CORNERS
============================================================ */
function DetectionCorners() {
  return (
    <div style={{ position: "absolute", inset: "15%", border: "1px solid rgba(0,229,208,.15)" }}>
      <motion.span 
        initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
        style={styles.cornerTL} 
      />
      <motion.span 
        initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
        style={styles.cornerTR} 
      />
      <motion.span 
        initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
        style={styles.cornerBL} 
      />
      <motion.span 
        initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}
        style={styles.cornerBR} 
      />
    </div>
  );
}

/* ============================================================
   RESULT ROW
============================================================ */
function ResultRow({ label, value }) {
  return (
    <div style={styles.resultRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/* ============================================================
   SYNC ROW
============================================================ */
function SyncRow({ text, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -15 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={styles.syncRow}
    >
      <span style={{ color: TEAL }}>●</span>
      {text}
      <span style={{ marginLeft: "auto", color: TEAL }}>✓</span>
    </motion.div>
  );
}

/* ============================================================
   STYLES
============================================================ */
const styles = {
  container: {
    position: "fixed",
    inset: 0,
    background: "#020404",
    color: "#fff",
    overflow: "hidden",
    zIndex: 99999,
    fontFamily: "'Inter', sans-serif"
  },
  fullscreenBg: {
    position: "absolute",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    zIndex: -1,
    opacity: 0.8
  },
  vignette: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(circle, transparent 30%, rgba(0,0,0,0.85) 100%)",
    pointerEvents: "none",
    zIndex: 0
  },
  topBar: {
    position: "absolute",
    top: 35,
    left: 45,
    right: 45,
    display: "flex",
    justifyContent: "space-between",
    fontFamily: "monospace",
    fontSize: 9,
    letterSpacing: 3,
    color: "rgba(255,255,255,.6)",
    zIndex: 20
  },
  stageTitle: {
    position: "absolute",
    top: 35,
    left: "50%",
    transform: "translateX(-50%)",
    fontFamily: "monospace",
    fontSize: 10,
    letterSpacing: 2,
    color: "rgba(255,255,255,.8)",
    zIndex: 20
  },
  dot: {
    display: "inline-block",
    width: 6,
    height: 6,
    background: TEAL,
    borderRadius: "50%",
    marginRight: 8,
    boxShadow: `0 0 10px ${TEAL}`
  },
  scene: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  statusBox: {
    position: "absolute",
    left: "10%",
    bottom: "20%",
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 2.2,
    letterSpacing: 2,
    color: "rgba(255,255,255,.7)"
  },
  ready: {
    color: TEAL,
    marginTop: 5
  },
  scanText: {
    position: "absolute",
    left: "10%",
    bottom: "20%",
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 2.2,
    letterSpacing: 2,
    color: "rgba(255,255,255,.7)"
  },
  loadingDots: {
    color: TEAL,
    letterSpacing: 5,
    marginTop: 5
  },
  vehicleBox: {
    position: "absolute",
    width: "40%",
    height: "55%",
    border: `1.5px solid ${TEAL}`,
    boxShadow: "0 0 25px rgba(0,229,208,.2)"
  },
  vehicleLabel: {
    position: "absolute",
    top: -25,
    right: 0,
    background: TEAL,
    color: "#001412",
    padding: "6px 12px",
    fontFamily: "monospace",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 1
  },
  trackingText: {
    position: "absolute",
    bottom: "20%",
    left: "10%",
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 2.2,
    letterSpacing: 2,
    color: "rgba(255,255,255,.7)"
  },
  plateBox: {
    position: "absolute",
    top: "55%",
    width: 200,
    height: 50,
    border: `2px solid ${TEAL}`,
    boxShadow: "0 0 25px rgba(0,229,208,.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,10,10,0.2)"
  },
  plate: {
    width: 170,
    height: 32,
    background: "#cfcfcf",
    color: "#080808",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "monospace",
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 2
  },
  plateScanner: {
    position: "absolute",
    top: "55%",
    width: 210,
    height: 1.5,
    background: TEAL,
    boxShadow: "0 0 15px rgba(0,229,208,1)"
  },
  bottomStatus: {
    position: "absolute",
    bottom: "20%",
    left: "10%",
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 2.2,
    letterSpacing: 2,
    color: "rgba(255,255,255,.7)"
  },
  bigPlateBox: {
    position: "relative",
    padding: 15,
    border: `2px solid ${TEAL}`,
    background: "rgba(0,10,10,0.4)"
  },
  bigPlate: {
    width: 400,
    height: 110,
    background: "#cfcfcf",
    color: "#050505",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "monospace",
    fontSize: 34,
    fontWeight: 900,
    letterSpacing: 5
  },
  horizontalScan: {
    position: "absolute",
    width: 450,
    height: 2,
    background: TEAL,
    boxShadow: "0 0 20px rgba(0,229,208,.9)"
  },
  processingText: {
    position: "absolute",
    bottom: "20%",
    left: "10%",
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 2.2,
    letterSpacing: 2,
    color: "rgba(255,255,255,.7)"
  },
  ocrLayout: {
    display: "flex",
    alignItems: "center",
    gap: 45,
    width: "800px",
    maxWidth: "90vw",
    zIndex: 10
  },
  ocrImage: {
    position: "relative",
    width: 450,
    height: 190,
    border: "1px solid rgba(0,229,208,.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  ocrPlate: {
    width: 320,
    height: 85,
    background: "#cfcfcf",
    color: "#050505",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "monospace",
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 3
  },
  ocrScan: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    background: TEAL,
    boxShadow: "0 0 15px rgba(0,229,208,.9)"
  },
  resultPanel: {
    width: 250,
    padding: 25,
    border: "1px solid rgba(0,229,208,.25)",
    background: "rgba(0,15,15,.7)"
  },
  resultTitle: {
    fontFamily: "monospace",
    fontSize: 9,
    letterSpacing: 2,
    color: TEAL,
    marginBottom: 15
  },
  resultPlate: {
    fontFamily: "monospace",
    fontSize: 20,
    fontWeight: 800,
    marginBottom: 20,
    color: "#fff"
  },
  resultRow: {
    display: "flex",
    justifyContent: "space-between",
    borderTop: "1px solid rgba(255,255,255,.06)",
    padding: "10px 0",
    fontFamily: "monospace",
    fontSize: 8,
    letterSpacing: 1,
    color: "rgba(255,255,255,.5)"
  },
  ocrStatus: {
    position: "absolute",
    bottom: "20%",
    left: "10%",
    fontFamily: "monospace",
    fontSize: 10,
    lineHeight: 2.2,
    letterSpacing: 2,
    color: "rgba(255,255,255,.5)",
    zIndex: 10
  },
  syncLayout: {
    display: "flex",
    alignItems: "center",
    gap: 40,
    zIndex: 10
  },
  syncPanel: {
    width: 350,
    padding: 30,
    border: "1px solid rgba(0,229,208,.25)",
    background: "rgba(0,10,10,.7)"
  },
  syncTitle: {
    fontFamily: "monospace",
    fontSize: 10,
    letterSpacing: 2,
    color: "rgba(255,255,255,.6)",
    marginBottom: 25
  },
  syncRow: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    fontFamily: "monospace",
    fontSize: 9,
    letterSpacing: 1,
    color: "rgba(255,255,255,.7)",
    padding: "12px 0",
    borderBottom: "1px solid rgba(255,255,255,.08)"
  },
  logoScene: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10
  },
  logo: {
    margin: 0,
    fontSize: "clamp(50px,8vw,90px)",
    fontWeight: 300,
    letterSpacing: 10,
    position: "relative",
    display: "flex",
    alignItems: "center",
    zIndex: 2
  },
  subtitle: {
    marginTop: 25,
    fontSize: 12,
    letterSpacing: 8,
    color: "rgba(255,255,255,.5)",
    fontWeight: 600,
    zIndex: 2
  },
  online: {
    marginTop: 50,
    fontFamily: "monospace",
    fontSize: 10,
    letterSpacing: 3,
    color: "rgba(255,255,255,.4)",
    zIndex: 2
  },
  footer: {
    position: "absolute",
    bottom: 35,
    left: 45,
    right: 45,
    display: "flex",
    justifyContent: "space-between",
    fontFamily: "monospace",
    fontSize: 9,
    letterSpacing: 3,
    color: "rgba(255,255,255,.4)",
    zIndex: 20
  },
  cornerTL: {
    position: "absolute",
    top: -1,
    left: -1,
    width: 30,
    height: 30,
    borderTop: `2px solid ${TEAL}`,
    borderLeft: `2px solid ${TEAL}`
  },
  cornerTR: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 30,
    height: 30,
    borderTop: `2px solid ${TEAL}`,
    borderRight: `2px solid ${TEAL}`
  },
  cornerBL: {
    position: "absolute",
    bottom: -1,
    left: -1,
    width: 30,
    height: 30,
    borderBottom: `2px solid ${TEAL}`,
    borderLeft: `2px solid ${TEAL}`
  },
  cornerBR: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 30,
    height: 30,
    borderBottom: `2px solid ${TEAL}`,
    borderRight: `2px solid ${TEAL}`
  }
};
