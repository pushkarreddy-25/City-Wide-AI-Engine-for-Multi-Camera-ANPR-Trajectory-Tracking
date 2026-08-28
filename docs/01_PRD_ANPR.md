# Product Requirements Document (PRD)
## City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking and Urban Traffic Analytics

**Project Name:** ANPR Traffic Intelligence Engine  
**Organization:** Bharat Electronics Limited  
**Theme:** Transportation & Logistics  
**Version:** 1.0  
**Date:** August 2026  

---

## 1. Problem Statement

### Current State
- Indian cities face unmanaged traffic congestion, unclear vehicle movement patterns across zones
- Traffic authorities manually track vehicle violations, parking violations, and lane infractions
- No real-time correlation of vehicle movement across multiple intersections or zones
- Decision-making on traffic signal timing, route optimization, and enforcement is reactive, not data-driven
- Nagpur, Bangalore, Mumbai traffic systems operate in silos without city-wide visibility

### Problem to Solve
Provide a **unified, real-time AI engine** that:
- Detects vehicles across multiple CCTV cameras at different intersections
- Tracks individual vehicle trajectories across the city
- Generates actionable traffic intelligence for city planners and traffic police
- Identifies patterns: congestion hotspots, frequent violators, peak flow times

### Why It Matters
- Reduces manual traffic monitoring workload
- Enables data-driven signal timing optimization
- Improves fine/violation tracking and prosecution
- Supports smart city infrastructure planning

---

## 2. Target Users

| User Role | Use Case | Pain Point |
|-----------|----------|-----------|
| **Traffic Police Officer** | Monitor live violations, track repeat offenders | Manual surveillance is exhausting, error-prone |
| **City Traffic Controller** | Optimize signal timing based on flow data | No real-time insight into city-wide patterns |
| **Smart City Planner** | Plan infrastructure (new roads, signal locations) | Decisions based on guesswork, not data |
| **Traffic Analytics Manager** | Generate compliance reports, identify trends | Collects data manually from multiple sources |

---

## 3. Project Goals (MVP)

1. **Real-Time Vehicle Detection:** Detect number plates and vehicles in live CCTV feeds from 5-10 intersection cameras
2. **Trajectory Tracking:** Link vehicle sightings across cameras to build movement history
3. **Live Dashboard:** Show real-time vehicle movements, congestion levels, violation alerts
4. **Violation Detection:** Identify common violations (red-light crossing, lane violations, speed estimation)
5. **Historical Analytics:** Generate daily/weekly reports on traffic patterns and congestion

---

## 4. Core Features (MVP Scope)

### 4.1 Vehicle Detection & Number Plate Recognition (ANPR)
- Real-time ANPR from RTSP/IP camera feeds
- Extract: License plate number, vehicle type (car/truck/bike), color
- Accuracy target: 85%+ for clear plates, 70%+ for obscured plates
- Latency: <500ms per frame

### 4.2 Multi-Camera Trajectory Linking
- Associate same vehicle across 2+ cameras based on:
  - Temporal proximity (vehicle seen at camera A at 10:05, camera B at 10:07)
  - Spatial proximity (cameras are 200m apart)
  - Visual features (color, vehicle type matching)
- Build vehicle journey history for single day

### 4.3 Live Dashboard
- Map view showing camera locations and live vehicle positions
- Real-time congestion heatmap (green/yellow/red zones)
- Violation alert feed (red-light runners, speed violators)
- Vehicle search: lookup where a number plate was seen
- Responsive design for desktop + tablets

### 4.4 Violation Detection Rules
- **Red-Light Crossing:** Vehicle crosses stop line during red signal (requires signal timing feed)
- **Lane Violation:** Vehicle enters wrong lane (detected via lane marking detection)
- **Speed Estimation:** Rough speed from frame-to-frame movement (compare with posted limit)
- **Parking Violation:** Vehicle stationary for >allowed time in no-parking zone

### 4.5 Historical Reports
- Daily traffic volume by intersection
- Congestion heatmaps (peak hours, bottleneck locations)
- Top 20 frequent routes in city
- Top 10 repeat violators
- Export to CSV/PDF

---

## 5. MVP Scope (What We Build in 3 Months)

### In Scope
- ✅ ANPR pipeline (YOLOv8 + EasyOCR)
- ✅ Trajectory tracking (DeepSORT or ByteTrack)
- ✅ Live dashboard with map + alerts
- ✅ Basic violation rules (red-light, lane crossing)
- ✅ 24-hour vehicle journey logs
- ✅ Camera simulation with public traffic datasets (BDD100K, UA-DETRAC)

### Out of Scope (Phase 2)
- ❌ Cloud deployment at scale
- ❌ Multi-city federation
- ❌ Predictive traffic modeling
- ❌ Integration with municipal ticketing systems
- ❌ Facial recognition or driver identification
- ❌ Custom hardware optimization (edge compute per camera)

---

## 6. User Stories

### Story 1: Traffic Police Officer Monitors Live Violations
**As a** traffic police officer  
**I want to** see real-time vehicle violations on my dashboard  
**So that** I can prioritize patrols and issue citations faster

**Acceptance Criteria:**
- Red-light violators highlighted with timestamp and camera location
- Show vehicle number plate, direction of travel
- Click to see vehicle's full route history

---

### Story 2: City Planner Analyzes Congestion Hotspots
**As a** city traffic planner  
**I want to** view historical congestion heatmaps by hour/day  
**So that** I can decide where to add new lanes or optimize signals

**Acceptance Criteria:**
- Heatmap shows red (congestion), yellow (moderate), green (free-flowing) zones
- Filter by time range (last 7 days, specific hours)
- Export as PNG/CSV with statistics

---

### Story 3: Manager Generates Weekly Report
**As a** traffic analytics manager  
**I want to** generate a weekly summary of traffic metrics  
**So that** I can present data to the city corporation for decision-making

**Acceptance Criteria:**
- Report includes: total vehicles, peak hours, top congestion zones, violation summary
- Downloadable as PDF with charts and tables

---

## 7. Success Metrics (How We Know It Works)

| Metric | Target | Baseline |
|--------|--------|----------|
| ANPR Accuracy (clear plates) | 85%+ | 0% (manual) |
| Trajectory Match Accuracy | 80%+ | N/A |
| Dashboard Response Time | <2s for live feed | N/A |
| Violation Detection Latency | <1 min from event to alert | 30+ min (manual) |
| System Uptime | 99% | N/A |
| False Positive Rate (violations) | <5% | N/A |

---

## 8. Assumptions

1. **Camera Feeds:** 5-10 RTSP/IP cameras available, stable 24/7 connectivity (or recorded datasets provided)
2. **Dataset:** Can use public traffic datasets (BDD100K, UA-DETRAC) for MVP; no real-world footage required for SIH submission
3. **Signal Timing:** Intersection signal status can be simulated or hardcoded for MVP
4. **Processing Power:** Server with GPU (RTX 3060 or better) sufficient for real-time processing of 5 cameras
5. **No Real Enforcement:** This is analytics tool; actual fine issuance out of scope
6. **Urban Streets:** Assumes structured road layouts, visible lane markings, reasonable lighting

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| ANPR accuracy low in poor lighting | High false positives | Use augmentation in training; graceful degradation (low-confidence plates filtered) |
| Trajectory linking errors across cameras | Incorrect violation reports | Require spatial/temporal confidence thresholds; manual review for low-confidence links |
| GPU memory bottleneck with 10 cameras | Slow processing, missed detections | Start with 3-5 cameras, optimize batch processing, consider frame skipping |
| Network latency causes delays | Real-time dashboard stale | Buffer 5-10s of frames; show "latency warning" in UI |
| Dataset bias (Indian road layouts different) | Poor generalization | Use Indian city traffic datasets; test on Nagpur/Bangalore samples |

---

## 10. Out-of-Scope Features (Phase 2+)

- Multi-city federation
- Predictive congestion modeling
- Integration with traffic signal control systems
- Cloud deployment + auto-scaling
- Mobile app for officers
- AI-based parking space availability
- Driver behavior profiling
- Integration with insurance companies

---

## 11. Acceptance Criteria (Jury Evaluation)

1. ✅ Live dashboard shows vehicles from ≥3 simulated cameras
2. ✅ ANPR extracts number plates with ≥75% accuracy on test dataset
3. ✅ Trajectory tracking correctly links vehicles across cameras (manual spot-check)
4. ✅ Violation detection triggers correctly for at least 2 violation types
5. ✅ Historical reports generate (even if with simulated data)
6. ✅ Code is clean, documented, deployable

---

## 12. Timeline (MVP - 12 Weeks)

- **Week 1-2:** ANPR model training, camera feed setup
- **Week 3-4:** Trajectory tracking + data fusion
- **Week 5-6:** Dashboard prototype + backend API
- **Week 7-8:** Violation detection rules, reporting
- **Week 9-10:** Testing, optimization, bug fixes
- **Week 11-12:** Documentation, demo, jury prep

---

## 13. Tech Stack (Recommended)

- **ANPR:** YOLOv8 (detection) + EasyOCR (OCR)
- **Tracking:** DeepSORT or ByteTrack
- **Backend:** FastAPI or Flask (Python)
- **Frontend:** React.js or Vue.js
- **Database:** PostgreSQL (for vehicle logs), Redis (for real-time cache)
- **Map:** Folium or Leaflet.js
- **Deployment:** Docker containers, local server or Render/Railway

---

**Next Steps:** Proceed to System Requirements Specification (SRS) for detailed functional requirements.
