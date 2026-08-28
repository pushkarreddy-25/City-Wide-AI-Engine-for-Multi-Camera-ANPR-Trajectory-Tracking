# System Requirements Specification (SRS)
## City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking

**Version:** 1.0  
**Date:** August 2026  
**Status:** Draft

---

## 1. Functional Requirements

### 1.1 ANPR (Automatic Number Plate Recognition) Module

#### FR1.1: Real-Time Vehicle Detection
- **Requirement:** System shall detect vehicles in live camera feeds at ≥2 FPS (frames per second)
- **Input:** RTSP/IP camera stream or video file
- **Output:** Bounding boxes around vehicles, confidence scores
- **Acceptance Criteria:**
  - Detects 90%+ of vehicles in frame (recall ≥0.9)
  - False positive rate <10%
  - Latency <500ms per frame

#### FR1.2: License Plate Extraction and OCR
- **Requirement:** System shall extract text from detected license plates
- **Input:** Vehicle bounding box region from detection
- **Output:** Extracted plate number as string, confidence score, plate region image
- **Acceptance Criteria:**
  - Character accuracy ≥80% for clear plates (Nagpur/Bangalore samples)
  - Character accuracy ≥60% for partially obscured plates
  - Extracts plate number in format: XX-XX-NN-NNNN (State-District-SerialPrefix-Serial)
  - Timestamp recorded to millisecond precision

#### FR1.3: Vehicle Attribute Extraction
- **Requirement:** System shall extract vehicle attributes
- **Input:** Vehicle bounding box
- **Output:** Vehicle type, color, rough size
- **Attributes:**
  - Type: Car, SUV, Truck, Motorcycle, Auto (rickshaw), Bus
  - Color: White, Black, Silver, Blue, Red, Yellow, Green, Other
  - Size: Small (motorcycle), Medium (car), Large (truck/bus)
- **Acceptance Criteria:**
  - Type classification ≥85% accuracy
  - Color detection ≥75% accuracy

---

### 1.2 Multi-Camera Trajectory Tracking

#### FR2.1: Single-Camera Vehicle Tracking
- **Requirement:** System shall track individual vehicles within a single camera's field of view
- **Input:** Detections from ANPR module across frames
- **Output:** Track ID (unique within camera, per day), position, velocity
- **Acceptance Criteria:**
  - Maintains track ID across ≥10 consecutive frames
  - Re-identification accuracy ≥85% (same vehicle gets same track ID if visible again)
  - Handles occlusions (vehicle hidden behind obstacle) for <3 seconds

#### FR2.2: Cross-Camera Trajectory Linking
- **Requirement:** System shall associate vehicle sightings across multiple cameras to build city-wide journey
- **Input:** 
  - Vehicle detection from Camera A: Time T1, Location (X1,Y1), Plate "MH-31-AB-1234"
  - Vehicle detection from Camera B: Time T1+5s, Location (X2,Y2), Plate "MH-31-AB-1234"
- **Output:** Single trajectory record linking both sightings, journey path with timestamps
- **Linking Criteria:**
  - Same license plate number (if OCR confidence ≥80%)
  - Same vehicle attributes (color, type) AND
  - Spatial-temporal feasibility (vehicle could travel from Camera A→B in observed time)
- **Acceptance Criteria:**
  - Links correct vehicle sightings ≥80% of time
  - False positive links <5%
  - Latency <10 seconds to complete linking

#### FR2.3: Journey History Persistence
- **Requirement:** System shall maintain and query vehicle journey history for a single day
- **Input:** Vehicle plate number, date
- **Output:** List of all camera sightings with timestamps, locations, sequence
- **Example:** 
  ```
  Plate: MH-31-AB-1234
  Date: 2026-08-23
  Sightings:
  - 08:15 - Camera "Sitabuldi_Intersection" - Direction: North
  - 08:22 - Camera "Dhantoli_Intersection" - Direction: North
  - 08:31 - Camera "Nagpur_Square_Intersection" - Direction: East
  ```
- **Acceptance Criteria:**
  - Query returns results in <2 seconds
  - Sequence order correct
  - Includes all sightings for the date

---

### 1.3 Live Dashboard Backend APIs

#### FR3.1: Live Vehicle Position API
- **Endpoint:** `GET /api/vehicles/live`
- **Output:**
  ```json
  {
    "timestamp": "2026-08-23T10:30:45Z",
    "vehicles": [
      {
        "track_id": "cam_5_track_42",
        "plate": "MH-31-AB-1234",
        "position": {"lat": 21.1458, "lng": 79.0882},
        "camera_id": "cam_5",
        "confidence": 0.92,
        "type": "Car",
        "color": "Silver"
      }
    ]
  }
  ```
- **Update Frequency:** 2 Hz (every 500ms)
- **Latency:** <2 seconds

#### FR3.2: Congestion Heatmap API
- **Endpoint:** `GET /api/congestion/heatmap?start_time=T1&end_time=T2`
- **Output:** Grid-based congestion scores (0-100) for each road segment
- **Calculation:** Vehicles per meter of road / expected capacity
- **Update Frequency:** Every 5 minutes
- **Acceptance Criteria:**
  - Identifies actual congestion zones (manual spot-check)
  - Responds in <3 seconds

#### FR3.3: Violation Alert API
- **Endpoint:** `GET /api/violations/alerts`
- **Output:**
  ```json
  {
    "violations": [
      {
        "violation_id": "vio_1001",
        "type": "red_light",
        "plate": "MH-31-AB-1234",
        "timestamp": "2026-08-23T10:32:15Z",
        "camera_id": "cam_3",
        "evidence_image_url": "/images/vio_1001.jpg",
        "severity": "high"
      }
    ]
  }
  ```
- **Latency:** Alert within 60 seconds of violation detection

#### FR3.4: Vehicle Search API
- **Endpoint:** `POST /api/vehicles/search`
- **Request:**
  ```json
  {
    "plate": "MH-31-AB-1234",
    "date": "2026-08-23"
  }
  ```
- **Response:** Full journey history with timestamps, locations, camera names
- **Latency:** <2 seconds

---

### 1.4 Violation Detection

#### FR4.1: Red-Light Crossing Detection
- **Requirement:** System shall detect vehicles crossing stop line during red light
- **Input:** Vehicle detection + signal state (from traffic signal feed or simulation)
- **Logic:**
  - Vehicle crosses stop line when Y-coordinate increases beyond threshold
  - Signal is RED at that moment
  - Vehicle velocity >0 (moving, not stationary)
- **Output:** Violation record with plate, timestamp, video clip, severity = HIGH
- **Acceptance Criteria:**
  - Detects >90% of actual red-light runners in test video
  - False positive rate <5%

#### FR4.2: Lane Violation Detection
- **Requirement:** System shall detect vehicles driving in wrong lane
- **Input:** Vehicle bounding box + lane markings (pre-drawn on road)
- **Logic:**
  - Divide road into lanes (e.g., 3 lanes for 12m wide road)
  - Track vehicle center X-coordinate across frames
  - Detect if vehicle crosses lane boundary abruptly (not gradual lane change)
- **Output:** Violation record with plate, timestamp, camera, severity = MEDIUM
- **Acceptance Criteria:**
  - Detects wrong-way vehicles
  - Distinguishes from normal lane changes

#### FR4.3: Speed Estimation
- **Requirement:** System shall estimate vehicle speed from pixel movement
- **Input:** Vehicle position across consecutive frames + camera calibration (pixels per meter)
- **Calculation:**
  ```
  speed_kmh = (distance_pixels * pixels_per_meter) / frame_interval * 3.6
  ```
- **Output:** Speed estimate, comparison with posted speed limit
- **Accuracy Target:** ±5 kmh error (for demo purposes)
- **Acceptance Criteria:**
  - Rough speed estimates available (exact calibration not required for MVP)

---

### 1.5 Historical Analytics & Reporting

#### FR5.1: Daily Traffic Volume Report
- **Endpoint:** `GET /api/reports/daily-volume?date=2026-08-23`
- **Output:**
  ```json
  {
    "date": "2026-08-23",
    "total_vehicles": 5234,
    "by_camera": {
      "cam_1": 812,
      "cam_2": 1045,
      "cam_3": 923
    },
    "by_type": {
      "Car": 3100,
      "Truck": 890,
      "Motorcycle": 1000,
      "Bus": 244
    },
    "peak_hours": ["09:00-10:00", "17:00-18:00"]
  }
  ```

#### FR5.2: Congestion Heatmap Report (Historical)
- **Endpoint:** `GET /api/reports/congestion-heatmap?start_date=D1&end_date=D2`
- **Output:** Heatmap data (grid of congestion scores) aggregated by time of day
- **Format:** CSV or JSON grid
- **Usage:** Identify persistent bottlenecks for infrastructure planning

#### FR5.3: Violation Summary Report
- **Endpoint:** `GET /api/reports/violations-summary?start_date=D1&end_date=D2`
- **Output:**
  ```json
  {
    "period": "2026-08-16 to 2026-08-23",
    "total_violations": 342,
    "by_type": {
      "red_light": 180,
      "lane_violation": 98,
      "speed": 64
    },
    "top_10_repeat_offenders": [
      {
        "plate": "MH-31-XY-5678",
        "violation_count": 12,
        "dates": ["2026-08-20", "2026-08-21", ...]
      }
    ]
  }
  ```

#### FR5.4: Report Export
- **Format Support:** CSV, PDF (with charts)
- **Content:** Tables + simple bar charts for volume and violations
- **Latency:** <10 seconds to generate

---

## 2. Non-Functional Requirements

### 2.1 Performance
- **Real-time Processing:** ≥2 FPS for 5 cameras simultaneously (GPU-assisted)
- **API Response Time:** 
  - Live feed: <2 seconds
  - Historical query: <5 seconds
  - Report generation: <15 seconds
- **Memory Usage:** <8 GB for 5 cameras + tracking + cache
- **Storage:** 
  - 500 GB for 30 days of event logs (vehicles, violations, errors)
  - Optional: Store snapshots (5 GB/day)

### 2.2 Reliability & Availability
- **Uptime:** 99% (allow <7 min downtime/week)
- **Data Loss Prevention:** Persist critical events (violations, journeys) to DB immediately
- **Graceful Degradation:** If 1 camera feed fails, system continues with remaining cameras
- **Backup:** Daily database backup, 7-day retention

### 2.3 Security
- **API Authentication:** Bearer token or API key for dashboard access
- **Data Encryption:** HTTPS for all API calls, encryption at rest for sensitive fields (plate numbers)
- **Access Control:** 
  - Admin: Full access
  - Police Officer: Read-only access + violation alerts
  - City Planner: Read-only aggregate reports (no individual plate queries)
- **Audit Logging:** Log all searches by plate number (for privacy compliance)

### 2.4 Scalability
- **Horizontal Scaling:** Architecture supports adding cameras without code changes
- **Database Indexing:** Optimize queries on (plate_number, timestamp, camera_id)
- **Caching:** Redis cache for recent vehicle positions, heatmaps

### 2.5 Maintainability
- **Code Quality:** Clean code, modular functions, unit tests for core modules
- **Documentation:** API documentation (Swagger), model training guide, deployment guide
- **Error Handling:** Graceful error messages, retry logic for camera feed failures

---

## 3. User Roles & Permissions

| Role | Capabilities | Restrictions |
|------|--------------|--------------|
| **Admin** | Deploy, train models, manage camera feeds, view all data | Full access |
| **Traffic Police Officer** | View live violations, search plate history, download violation reports | Cannot modify settings, cannot access raw footage |
| **City Traffic Controller** | View congestion heatmaps, analyze trends, optimize signal timing | Cannot view individual violations or plates |
| **Analytics Manager** | Generate reports, export data, create custom queries | Cannot modify camera calibration |
| **Public (Read-Only)** | Access aggregate statistics only (no plate numbers) | No access to individual vehicle data |

---

## 4. Data Requirements

### 4.1 Data Entities

#### Vehicle Detection Record
```
{
  "detection_id": "det_12345",
  "camera_id": "cam_1",
  "timestamp": "2026-08-23T10:30:45.123Z",
  "vehicle": {
    "type": "Car",
    "color": "Silver",
    "plate_text": "MH-31-AB-1234",
    "confidence": 0.92,
    "bbox": {"x": 100, "y": 50, "w": 80, "h": 60}
  },
  "processed": true
}
```

#### Trajectory Record
```
{
  "trajectory_id": "traj_67890",
  "plate": "MH-31-AB-1234",
  "date": "2026-08-23",
  "sightings": [
    {
      "camera_id": "cam_1",
      "timestamp": "2026-08-23T08:15:30Z",
      "position": {"lat": 21.1458, "lng": 79.0882},
      "direction": "North"
    },
    {
      "camera_id": "cam_5",
      "timestamp": "2026-08-23T08:22:15Z",
      "position": {"lat": 21.1520, "lng": 79.0890},
      "direction": "North"
    }
  ]
}
```

#### Violation Record
```
{
  "violation_id": "vio_1001",
  "type": "red_light",
  "plate": "MH-31-AB-1234",
  "camera_id": "cam_3",
  "timestamp": "2026-08-23T10:32:15Z",
  "confidence": 0.85,
  "severity": "high",
  "image_url": "/storage/violations/vio_1001.jpg",
  "resolved": false
}
```

### 4.2 Data Retention
- **Vehicle Detection Logs:** 7 days (for debugging)
- **Violation Records:** 90 days (for prosecution/appeals)
- **Trajectory Data:** 30 days (for historical analysis)
- **Aggregated Reports:** Retain indefinitely

---

## 5. Validation & Business Rules

### 5.1 Plate Number Validation
- Must match Indian format: XX-XX-NN-NNNN (or XX-XX-NNNN for temp vehicles)
- Confidence score ≥70% required for violation alert
- Confidence score ≥50% required for tracking (lower threshold, more lenient)

### 5.2 Trajectory Linking Rules
- Time gap between cameras <10 minutes (vehicle must be linked within reasonable time)
- Spatial distance feasible (calculate max possible speed, ensure vehicle could travel in time)
- Plate match confidence ≥80% OR vehicle attributes match + confidence ≥60%

### 5.3 Violation Rules
- Red-light: Vehicle crosses stop line during RED phase (≥80% of vehicle in crossing zone)
- Lane violation: Vehicle center crosses lane boundary by >50% lane width
- Speed: Speed estimate >posted limit + 10% (margin for calibration error)

---

## 6. Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| Camera feed disconnects | Alert admin, cache last known frame, resume when feed returns |
| ANPR confidence too low | Mark as "unidentified_vehicle", continue tracking by appearance |
| Vehicle leaves city (not seen for 1 hour) | Close trajectory, mark as "exited" |
| Plate overlap/multiple vehicles | Track separately if bounding boxes don't overlap; merge if uncertain |
| Night/low-light conditions | Degrade gracefully, relax accuracy thresholds (show warnings in UI) |
| Duplicate violations (same plate, <5 min apart) | Merge as single incident, take highest confidence image |

---

## 7. Acceptance Criteria (Final Validation)

1. ✅ ANPR module achieves ≥75% plate accuracy on test video
2. ✅ Trajectory linking ≥80% accuracy (manual spot-check on 20 vehicles)
3. ✅ Live dashboard updates every 500ms
4. ✅ Violation detection <60s latency from event to alert
5. ✅ Reports generate in <15 seconds
6. ✅ System handles camera failure gracefully
7. ✅ All APIs documented with Swagger
8. ✅ Codebase has unit tests for core modules (≥70% coverage)

---

**Next Steps:** Proceed to System Architecture Document for technical design details.
