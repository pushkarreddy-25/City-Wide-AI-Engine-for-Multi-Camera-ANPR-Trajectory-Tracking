# System Architecture Document
## City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking

**Version:** 1.0  
**Date:** August 2026  

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    LIVE DASHBOARD                           │
│                  (React.js Frontend)                        │
│         Map + Violations + Reports + Search                 │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS/WebSocket
┌─────────────────────────────────────────────────────────────┐
│              BACKEND API LAYER (FastAPI)                    │
│  /api/vehicles/live, /api/violations, /api/reports, etc.   │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
┌──────────────────┐    ┌─────────────────────────┐
│   CACHE LAYER    │    │   PROCESSING PIPELINE   │
│   (Redis)        │    │   (Python Workers)      │
│                  │    │                         │
│ - Live positions │    │ ANPR → Tracking →      │
│ - Heatmaps       │    │ Linking → Violations   │
│ - Recent alerts  │    │ → Analytics             │
└──────────────────┘    └──────────┬──────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
        ┌───────────────┐  ┌───────────────┐  ┌──────────────┐
        │  ANPR MODULE  │  │ TRACKING      │  │ LINKING      │
        │               │  │ MODULE        │  │ MODULE       │
        │ YOLOv8 + OCR  │  │ DeepSORT /    │  │              │
        │               │  │ ByteTrack     │  │ Spatial-      │
        │               │  │               │  │ Temporal      │
        └───────────────┘  └───────────────┘  └──────────────┘
                │                  │                  │
                └──────────────────┼──────────────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                │                                     │
        ┌──────────────────┐             ┌────────────────────┐
        │  CAMERA FEEDS    │             │  DATABASE LAYER    │
        │  (RTSP/Video)    │             │  (PostgreSQL)      │
        │                  │             │                    │
        │ - Sitabuldi Int. │             │ - Detections       │
        │ - Dhantoli Int.  │             │ - Trajectories     │
        │ - Nagpur Square  │             │ - Violations       │
        │ - (5-10 total)   │             │ - Historical Data  │
        └──────────────────┘             └────────────────────┘
```

---

## 2. Component Design

### 2.1 ANPR Module (Vehicle Detection & OCR)

**Purpose:** Extract vehicle information from camera feeds in real-time

#### 2.1.1 Vehicle Detection
- **Model:** YOLOv8 (nano or small variant for speed)
- **Training Data:** 
  - COCO dataset (80 classes, includes car, truck, motorcycle)
  - Fine-tune on Indian traffic dataset (BDD100K, UA-DETRAC with Nagpur samples)
- **Inference:**
  ```python
  from ultralytics import YOLO
  
  model = YOLO('yolov8s.pt')
  results = model(frame)  # Returns detections in frame
  ```
- **Output:** Bounding boxes, confidence scores, class labels
- **Performance:** ~30 FPS on RTX 3060 (small model)

#### 2.1.2 License Plate Extraction & OCR
- **Approach:**
  1. From vehicle bounding box, estimate plate region (lower-middle area)
  2. Crop plate region
  3. Run OCR (EasyOCR or Tesseract)
  4. Parse output to match Indian plate format: XX-XX-NN-NNNN
- **Implementation:**
  ```python
  import easyocr
  
  reader = easyocr.Reader(['en', 'hi'])  # English + Hindi
  plate_region = frame[y1:y2, x1:x2]
  results = reader.readtext(plate_region)
  plate_text = ''.join([r[1] for r in results])
  ```
- **OCR Confidence:** Return confidence score; filter <70% for violations

#### 2.1.3 Vehicle Attribute Classification
- **Color Detection:**
  - Method: Histogram analysis on cropped vehicle region
  - Bin colors: White, Black, Silver, Blue, Red, Yellow, Green
  - Output: Dominant color + confidence
- **Type Classification:**
  - Use YOLO class output directly (car, truck, motorcycle, bus)
  - Or secondary classifier if needed for sub-types

#### 2.1.4 ANPR Pipeline Code Structure
```python
# anpr_module.py

class ANPREngine:
    def __init__(self, yolo_model_path, ocr_lang=['en']):
        self.detector = YOLO(yolo_model_path)
        self.ocr = easyocr.Reader(ocr_lang)
    
    def process_frame(self, frame, timestamp):
        # Detect vehicles
        detections = self.detector(frame)
        
        results = []
        for det in detections.boxes:
            vehicle_info = {
                'bbox': det.xyxy,
                'confidence': det.conf,
                'class': det.cls,
                'type': self._classify_type(det.cls),
                'timestamp': timestamp
            }
            
            # Extract plate
            plate_region = self._crop_plate_region(frame, det.xyxy)
            ocr_result = self.ocr.readtext(plate_region)
            vehicle_info['plate'] = self._parse_plate(ocr_result)
            vehicle_info['plate_confidence'] = self._get_confidence(ocr_result)
            
            # Detect color
            vehicle_info['color'] = self._detect_color(frame, det.xyxy)
            
            results.append(vehicle_info)
        
        return results
```

---

### 2.2 Tracking Module (Single-Camera)

**Purpose:** Assign unique track IDs to vehicles within a camera's view

#### 2.2.1 Algorithm: DeepSORT or ByteTrack
- **DeepSORT:**
  - Uses Kalman Filter for motion prediction
  - Deep learning for appearance matching (ReID features)
  - Connects detections across frames
- **ByteTrack:**
  - Simpler, faster than DeepSORT
  - High-confidence tracks + low-confidence tracks + linking
  - Better for crowded scenes

**Choice:** ByteTrack (easier to implement, faster for MVP)

#### 2.2.2 Implementation
```python
# tracking_module.py

from yolox.tracker import BYTETracker

class TrackingEngine:
    def __init__(self):
        self.tracker = BYTETracker(
            frame_rate=30,
            track_thresh=0.5,
            track_buffer=30,
            match_thresh=0.8
        )
    
    def update(self, detections, frame):
        """
        Input: Detections from ANPR
        Output: Track IDs assigned to detections
        """
        online_tlwhs, online_ids = self.tracker.update(
            detections,  # (x1, y1, x2, y2, confidence)
            frame
        )
        
        return online_ids  # Track ID for each detection
```

#### 2.2.3 Output
- Each vehicle detection gets a `track_id` (e.g., `cam_1_track_42`)
- Track maintained across frames as long as vehicle is visible
- Reset if vehicle disappears for >5 frames

---

### 2.3 Linking Module (Cross-Camera Trajectory)

**Purpose:** Connect vehicle sightings across multiple cameras into a single journey

#### 2.3.1 Linking Strategy
```
Camera A: Time=10:05:30, Plate="MH-31-AB-1234", Position=(50m, 0m)
Camera B: Time=10:05:35, Plate="MH-31-AB-1234", Position=(250m, 50m)

Distance = sqrt((250-50)² + (50-0)²) = ~203 meters
Time Delta = 5 seconds
Speed = 203m / 5s = 40.6 m/s = 146 kmh (unrealistic, too fast)
→ REJECT this link

---

Camera A: Time=10:05:30, Plate="MH-31-AB-1234", Color=Silver, Type=Car
Camera C: Time=10:05:45, Plate="MH-31-AB-1234", Color=Silver, Type=Car

Distance = 500 meters
Time Delta = 15 seconds
Speed = 500m / 15s = 33 m/s = 120 kmh (urban speed, realistic)
→ ACCEPT this link
```

#### 2.3.2 Linking Algorithm
```python
# linking_module.py

class TrajectoryLinker:
    MAX_TIME_GAP = 600  # 10 minutes
    MAX_SPEED = 40  # meters/second (144 kmh, upper urban limit)
    
    def link_vehicles(self, detections_by_camera):
        """
        Input: All detections from all cameras for past 10 minutes
        Output: List of trajectories (linked journeys)
        """
        trajectories = []
        unlinked = list(detections_by_camera)
        
        while unlinked:
            detection = unlinked.pop(0)
            traj = [detection]
            
            # Find matching detections from other cameras
            for other_det in unlinked[:]:
                if self._should_link(detection, other_det):
                    traj.append(other_det)
                    unlinked.remove(other_det)
            
            trajectories.append(traj)
        
        return trajectories
    
    def _should_link(self, det1, det2):
        # Same plate (high confidence)
        if det1['plate'] == det2['plate'] and \
           det1['plate_confidence'] > 0.8:
            return True
        
        # Same attributes + spatial-temporal feasibility
        if self._same_attributes(det1, det2) and \
           self._feasible_travel(det1, det2):
            return True
        
        return False
    
    def _feasible_travel(self, det1, det2):
        time_gap = abs(det2['timestamp'] - det1['timestamp'])
        distance = self._distance(det1['position'], det2['position'])
        
        if time_gap == 0:
            return False
        
        speed = distance / time_gap
        return 0 < speed < self.MAX_SPEED and time_gap < self.MAX_TIME_GAP
```

#### 2.3.3 Data Structure
```python
class Trajectory:
    def __init__(self, plate, date):
        self.plate = plate
        self.date = date
        self.sightings = []  # List of (camera, timestamp, position)
    
    def add_sighting(self, camera_id, timestamp, position, direction):
        self.sightings.append({
            'camera_id': camera_id,
            'timestamp': timestamp,
            'position': position,
            'direction': direction
        })
    
    def get_journey_string(self):
        """Return human-readable journey"""
        journey = f"{self.plate} on {self.date}: "
        journey += " → ".join([f"{s['camera_id']} ({s['timestamp'].strftime('%H:%M')})" 
                               for s in sorted(self.sightings, key=lambda x: x['timestamp'])])
        return journey
```

---

### 2.4 Violation Detection Module

**Purpose:** Identify traffic violations based on detections and business rules

#### 2.4.1 Red-Light Crossing
```python
# violations_module.py

class ViolationDetector:
    def __init__(self, camera_config):
        self.camera_config = camera_config  # Calibration: pixels per meter, stop line Y position
    
    def detect_red_light(self, detections, signal_state):
        """
        Input:
        - detections: Vehicles and their positions frame-by-frame
        - signal_state: Current traffic signal (RED/YELLOW/GREEN)
        
        Output: Violation records
        """
        violations = []
        
        for track_id, detection_sequence in detections.items():
            for i, det in enumerate(detection_sequence):
                # Check if vehicle crossed stop line during red
                if i > 0:
                    prev_y = detection_sequence[i-1]['bbox'][1]
                    curr_y = det['bbox'][1]
                    
                    stop_line_y = self.camera_config['stop_line_y']
                    
                    # Vehicle moved past stop line
                    if prev_y > stop_line_y and curr_y <= stop_line_y:
                        # Check if signal was red
                        if signal_state[i] == 'RED':
                            violations.append({
                                'type': 'red_light',
                                'plate': det['plate'],
                                'camera_id': self.camera_config['id'],
                                'timestamp': det['timestamp'],
                                'severity': 'HIGH'
                            })
        
        return violations
```

#### 2.4.2 Lane Violation
```python
def detect_lane_violation(self, detections, lane_markings):
    """
    lane_markings: List of lane boundary X coordinates
    e.g., [100, 200, 300] for 3 lanes
    """
    violations = []
    
    for track_id, detection_sequence in detections.items():
        prev_lane = None
        
        for det in detection_sequence:
            vehicle_center_x = (det['bbox'][0] + det['bbox'][2]) / 2
            curr_lane = self._get_lane(vehicle_center_x, lane_markings)
            
            if prev_lane is not None and prev_lane != curr_lane:
                # Lane change detected - check if abrupt (not gradual)
                if abs(prev_lane - curr_lane) > 1:  # Skipped a lane
                    violations.append({
                        'type': 'lane_violation',
                        'plate': det['plate'],
                        'camera_id': self.camera_config['id'],
                        'timestamp': det['timestamp'],
                        'severity': 'MEDIUM'
                    })
            
            prev_lane = curr_lane
    
    return violations
```

#### 2.4.3 Speed Estimation
```python
def estimate_speed(self, detection_sequence, camera_config):
    """
    Estimate vehicle speed from pixel movement
    """
    if len(detection_sequence) < 2:
        return None
    
    distances = []
    for i in range(1, len(detection_sequence)):
        prev_center = self._get_center(detection_sequence[i-1]['bbox'])
        curr_center = self._get_center(detection_sequence[i]['bbox'])
        
        pixel_distance = self._euclidean_distance(prev_center, curr_center)
        meter_distance = pixel_distance / camera_config['pixels_per_meter']
        
        distances.append(meter_distance)
    
    avg_distance_per_frame = sum(distances) / len(distances)
    frame_rate = camera_config['fps']
    speed_mps = avg_distance_per_frame * frame_rate
    speed_kmh = speed_mps * 3.6
    
    return speed_kmh
```

---

### 2.5 API Backend (FastAPI)

**Purpose:** Serve data to frontend dashboard

#### 2.5.1 Core Endpoints
```python
# main.py (FastAPI app)

from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
import redis
import psycopg2

app = FastAPI(title="ANPR Traffic Engine")

# Redis for real-time cache
redis_client = redis.Redis(host='localhost', port=6379)

# PostgreSQL for historical data
db_connection = psycopg2.connect(
    host='localhost',
    database='anpr_traffic',
    user='postgres',
    password='password'
)

@app.get("/api/vehicles/live")
async def get_live_vehicles():
    """Live vehicle positions from all cameras"""
    vehicles = redis_client.get('current_vehicles')
    return JSONResponse(content=json.loads(vehicles))

@app.get("/api/violations/alerts")
async def get_recent_violations():
    """Recent violation alerts"""
    alerts = redis_client.lrange('violation_alerts', 0, 99)
    return [json.loads(a) for a in alerts]

@app.post("/api/vehicles/search")
async def search_vehicle(plate: str, date: str):
    """Search vehicle journey history"""
    cursor = db_connection.cursor()
    cursor.execute(
        "SELECT * FROM trajectories WHERE plate = %s AND date = %s",
        (plate, date)
    )
    result = cursor.fetchone()
    return result if result else {"error": "Vehicle not found"}

@app.get("/api/reports/daily-volume")
async def get_daily_volume(date: str):
    """Daily vehicle volume report"""
    cursor = db_connection.cursor()
    cursor.execute(
        """
        SELECT COUNT(*) as total_vehicles,
               vehicle_type,
               camera_id
        FROM detections
        WHERE DATE(timestamp) = %s
        GROUP BY vehicle_type, camera_id
        """,
        (date,)
    )
    results = cursor.fetchall()
    return {"date": date, "data": results}

@app.get("/api/congestion/heatmap")
async def get_congestion_heatmap(start_time: str, end_time: str):
    """Congestion heatmap for time range"""
    heatmap = redis_client.get(f'heatmap_{start_time}_{end_time}')
    return json.loads(heatmap) if heatmap else {"error": "No data"}
```

#### 2.5.2 Deployment
```bash
# Run with Uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

### 2.6 Frontend Dashboard (React.js)

**Purpose:** Visualize traffic data for operators

#### 2.6.1 Components
```
┌─ App
   ├─ Layout (Header + Sidebar)
   │  ├─ Header (title, time, user info)
   │  └─ Sidebar (menu: Dashboard, Violations, Reports, Search)
   │
   ├─ Dashboard (default view)
   │  ├─ Map (Folium or Leaflet)
   │  │  ├─ Camera markers
   │  │  ├─ Live vehicle positions
   │  │  └─ Congestion heatmap overlay
   │  │
   │  ├─ Real-Time Stats
   │  │  ├─ Total vehicles (live)
   │  │  ├─ Congestion level (%)
   │  │  └─ Active violations (count)
   │  │
   │  └─ Violation Feed
   │     ├─ Recent violations list
   │     ├─ Severity color-coded
   │     └─ Click to view details + image
   │
   ├─ ViolationDetails (modal)
   │  ├─ Violation image
   │  ├─ Plate number
   │  ├─ Camera, timestamp
   │  └─ Export/print option
   │
   ├─ SearchVehicle
   │  ├─ Plate number input
   │  ├─ Date picker
   │  └─ Journey map
   │
   └─ Reports
      ├─ Daily Volume Report
      ├─ Congestion Heatmap
      ├─ Violation Summary
      └─ Export buttons (CSV/PDF)
```

#### 2.6.2 Tech Stack
- **Framework:** React.js (with Hooks)
- **HTTP:** Axios for API calls
- **Map:** Leaflet.js or Folium (Python backend generates HTML)
- **UI Components:** Material-UI or Tailwind CSS
- **Real-Time:** WebSocket for live vehicle updates
- **Charts:** Chart.js or Recharts for reports

#### 2.6.3 Sample Component (Dashboard)
```jsx
// Dashboard.jsx

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Map from './Map';
import ViolationFeed from './ViolationFeed';
import Stats from './Stats';

export default function Dashboard() {
    const [vehicles, setVehicles] = useState([]);
    const [violations, setViolations] = useState([]);
    const [stats, setStats] = useState({});
    
    useEffect(() => {
        // Fetch live data every 500ms
        const interval = setInterval(async () => {
            const res = await axios.get('/api/vehicles/live');
            setVehicles(res.data.vehicles);
        }, 500);
        
        return () => clearInterval(interval);
    }, []);
    
    useEffect(() => {
        // Fetch violations every 5s
        const interval = setInterval(async () => {
            const res = await axios.get('/api/violations/alerts');
            setViolations(res.data.violations);
        }, 5000);
        
        return () => clearInterval(interval);
    }, []);
    
    return (
        <div className="dashboard">
            <Stats data={stats} />
            <Map vehicles={vehicles} />
            <ViolationFeed violations={violations} />
        </div>
    );
}
```

---

## 3. Database Schema

### 3.1 PostgreSQL Tables

```sql
-- Detections table
CREATE TABLE detections (
    detection_id SERIAL PRIMARY KEY,
    camera_id VARCHAR(50),
    timestamp TIMESTAMP NOT NULL,
    plate_text VARCHAR(20),
    plate_confidence FLOAT,
    vehicle_type VARCHAR(50),
    vehicle_color VARCHAR(50),
    bbox_x1 FLOAT,
    bbox_y1 FLOAT,
    bbox_x2 FLOAT,
    bbox_y2 FLOAT,
    image_path VARCHAR(255),
    FOREIGN KEY (camera_id) REFERENCES cameras(id),
    INDEX (plate_text, timestamp),
    INDEX (camera_id, timestamp)
);

-- Trajectories table
CREATE TABLE trajectories (
    trajectory_id SERIAL PRIMARY KEY,
    plate_text VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    vehicle_type VARCHAR(50),
    vehicle_color VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (plate_text, date)
);

-- Sightings table (one row per camera detection in trajectory)
CREATE TABLE sightings (
    sighting_id SERIAL PRIMARY KEY,
    trajectory_id INT NOT NULL,
    camera_id VARCHAR(50),
    timestamp TIMESTAMP,
    latitude FLOAT,
    longitude FLOAT,
    direction VARCHAR(20),
    FOREIGN KEY (trajectory_id) REFERENCES trajectories(trajectory_id),
    FOREIGN KEY (camera_id) REFERENCES cameras(id),
    INDEX (trajectory_id, timestamp)
);

-- Violations table
CREATE TABLE violations (
    violation_id SERIAL PRIMARY KEY,
    violation_type VARCHAR(50),
    plate_text VARCHAR(20),
    camera_id VARCHAR(50),
    timestamp TIMESTAMP NOT NULL,
    severity VARCHAR(20),
    confidence FLOAT,
    image_path VARCHAR(255),
    resolved BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (camera_id) REFERENCES cameras(id),
    INDEX (plate_text, timestamp),
    INDEX (violation_type, timestamp)
);

-- Cameras table
CREATE TABLE cameras (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100),
    latitude FLOAT,
    longitude FLOAT,
    rtsp_url VARCHAR(255),
    stop_line_y FLOAT,
    pixels_per_meter FLOAT,
    lane_boundaries FLOAT ARRAY
);
```

---

## 4. Data Flow

```
1. CAMERA FEED → ANPR Module
   Input: RTSP stream, 30 FPS
   Output: Vehicle detections + plate OCR
   
2. DETECTIONS → Tracking Module
   Input: Frame detections
   Output: Track IDs assigned
   
3. TRACK IDs → Linking Module
   Input: Tracked vehicles from all cameras (past 10 min)
   Output: Trajectories (linked journeys)
   
4. TRAJECTORIES → Violation Detector
   Input: Vehicle positions, trajectory history
   Output: Violation records
   
5. DETECTIONS + VIOLATIONS → Cache (Redis)
   → Live Dashboard (WebSocket updates)
   
6. VIOLATIONS → Database (PostgreSQL)
   → Historical query support
   → Report generation
```

---

## 5. Deployment Architecture

### 5.1 Development Environment
```
MacBook/Laptop/Windows PC
├─ Python 3.9+ venv
├─ YOLO weights (yolov8s.pt, ~45 MB)
├─ FastAPI server (port 8000)
├─ React dev server (port 3000)
├─ PostgreSQL (local or Docker)
└─ Redis (local or Docker)
```

### 5.2 Production Deployment (Optional, for demo)
```
Linux Server (AWS EC2 / DigitalOcean / Local)
├─ Docker container: FastAPI + YOLO + Redis
├─ Separate Docker container: PostgreSQL
├─ Nginx reverse proxy (port 80/443)
├─ Static hosting: React build files
└─ Volumes: Model weights, database files
```

**Docker Compose (docker-compose.yml):**
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://user:pass@db:5432/anpr_traffic
      REDIS_URL: redis://redis:6379
    depends_on:
      - db
      - redis
  
  db:
    image: postgres:14
    environment:
      POSTGRES_PASSWORD: password
      POSTGRES_DB: anpr_traffic
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7
    ports:
      - "6379:6379"
  
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  postgres_data:
```

---

## 6. Performance Optimization

### 6.1 ANPR Module
- Use YOLOv8n (nano) for faster inference
- Batch inference: Process multiple frames together
- GPU acceleration (CUDA)
- Frame skipping: Process every 2nd frame if CPU-bound

### 6.2 Tracking Module
- Use ByteTrack (faster than DeepSORT)
- Limit track buffer to 30 frames

### 6.3 Linking Module
- Pre-filter by plate match confidence (>80%)
- Cache camera coordinates (don't recalculate distance)
- Limit search window to past 10 minutes

### 6.4 Database
- Index on (plate, timestamp, camera_id)
- Partition tables by date for old data
- Archive data >90 days to cold storage

### 6.5 Frontend
- Lazy load reports (don't render 10,000 violations)
- WebSocket for live updates (vs polling every frame)
- Local storage cache for search history

---

## 7. Security & Privacy

- **API Authentication:** Bearer token (generate in /auth endpoint)
- **HTTPS/TLS:** All communication encrypted
- **Database:** Encrypt license plate numbers at rest
- **Audit Logging:** Log all plate searches with user ID
- **GDPR/India Privacy:** Retain violation data only 90 days, trajectories 30 days

---

**Next Steps:** Proceed to UI/UX Document for dashboard design and user flows.
