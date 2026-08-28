# Development Plan
## City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking

**Version:** 1.0  
**Date:** August 2026  
**Total Timeline:** 12 Weeks (MVP)

---

## 1. Project Overview & Timeline

### 1.1 Key Dates
- **Start Date:** Week 1 (Sep 1, 2026)
- **Final Demo Date:** Week 12 (Nov 17, 2026)
- **Buffer Time:** 1 week for bug fixes + documentation

### 1.2 Delivery Phases

| Phase | Duration | Deliverables | Status |
|-------|----------|--------------|--------|
| Phase 0: Setup | Week 1 | Repo, environment, data pipeline | Planning |
| Phase 1: ANPR Core | Week 2-3 | Model training, vehicle detection, OCR | Planning |
| Phase 2: Tracking | Week 4-5 | Single-camera tracking, trajectory linking | Planning |
| Phase 3: Backend API | Week 6-7 | FastAPI, database, real-time cache | Planning |
| Phase 4: Dashboard | Week 8-9 | React UI, map, live feed | Planning |
| Phase 5: Violations | Week 10 | Rule engine, alert system | Planning |
| Phase 6: Polish | Week 11-12 | Testing, optimization, documentation | Planning |

---

## 2. Phase 0: Setup & Infrastructure (Week 1)

### 2.1 Git Repository Setup
**Objective:** Establish clean project structure

**Tasks:**
```
☐ Create GitHub repo: anpr-traffic-engine
☐ Create .gitignore (Python, Node, IDE)
☐ Directory structure:
  anpr-traffic-engine/
  ├── backend/
  │   ├── anpr_module/
  │   ├── tracking_module/
  │   ├── linking_module/
  │   ├── violations/
  │   ├── api/
  │   ├── utils/
  │   └── requirements.txt
  ├── frontend/
  │   ├── src/
  │   │   ├── components/
  │   │   ├── pages/
  │   │   ├── styles/
  │   │   └── App.jsx
  │   └── package.json
  ├── docker-compose.yml
  ├── .env.example
  └── README.md
☐ Set up Python venv + pip
☐ Set up Node.js + npm
☐ Create README with setup instructions
```

**Deliverables:**
- GitHub repo with clean structure
- Setup documentation
- .env template for secrets

---

### 2.2 Environment & Database Setup

**Tasks:**
```
☐ PostgreSQL local installation (or Docker)
  $ docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:14
☐ Redis local installation (or Docker)
  $ docker run -d -p 6379:6379 redis:7
☐ Create database schema (run migrations)
  $ python manage.py init_db
☐ Test database connections from FastAPI + React
☐ Set up environment variables (.env file):
  DATABASE_URL=postgresql://user:pass@localhost:5432/anpr_traffic
  REDIS_URL=redis://localhost:6379
  FLASK_ENV=development
  JWT_SECRET=your_secret_key
```

**Deliverables:**
- Docker Compose with Postgres + Redis
- Database schema created
- .env template with all required variables

---

### 2.3 Data Preparation

**Tasks:**
```
☐ Download public traffic datasets:
  - BDD100K (Berkeley DeepDrive 100K)
  - UA-DETRAC (Urban-scene multi-camera vehicle tracking)
  - Nagpur/Bangalore traffic videos (if available)
☐ Create directory structure:
  data/
  ├── raw/
  │   ├── BDD100K/
  │   ├── UA-DETRAC/
  │   └── sample_videos/
  ├── processed/
  │   └── splits/ (train/val/test)
  └── annotations/
☐ Verify dataset format, licensing
☐ Document data preprocessing steps
```

**Deliverables:**
- Downloaded datasets in data/raw/
- Data preprocessing scripts
- Data documentation (format, sizes, license)

**Time Estimate:** 3 days

---

## 3. Phase 1: ANPR Core (Week 2-3)

### 3.1 Vehicle Detection (YOLOv8 Setup)

**Week 2, Days 1-2**

**Objective:** Detect vehicles in frames with ≥85% accuracy

**Tasks:**
```
☐ Install YOLOv8:
  pip install ultralytics
  
☐ Download pre-trained YOLOv8 models:
  from ultralytics import YOLO
  model = YOLO('yolov8s.pt')  # small model
  
☐ Create detection pipeline:
  anpr_module/detection.py:
    class VehicleDetector:
        def __init__(self, model_path):
            self.model = YOLO(model_path)
        
        def detect(self, frame):
            # Detects vehicles, returns bboxes + confidence
            results = self.model(frame)
            return self._parse_results(results)
        
        def _parse_results(self, results):
            detections = []
            for r in results:
                for box in r.boxes:
                    det = {
                        'bbox': box.xyxy.cpu().numpy(),
                        'confidence': box.conf.item(),
                        'class': int(box.cls.item()),
                        'class_name': r.names[int(box.cls)]
                    }
                    detections.append(det)
            return detections
  
☐ Test on sample video:
  python test_detection.py --input data/raw/sample.mp4
  Output: Detects cars, trucks, motorcycles, buses
  
☐ Benchmark speed:
  Target: ≥2 FPS on GPU (RTX 3060)
  
☐ Create unit tests:
  tests/test_detection.py
    - test_detects_vehicle()
    - test_high_confidence()
    - test_performance()
```

**Success Criteria:**
- ✅ Detects 90%+ vehicles in test video
- ✅ Runs at 2+ FPS
- ✅ Confidence scores within 0.0-1.0 range
- ✅ Unit tests pass

**Deliverables:**
- `anpr_module/detection.py`
- Trained model weights
- Test results with metrics

**Time Estimate:** 2 days

---

### 3.2 License Plate Extraction & OCR (Week 2, Days 3-4)

**Objective:** Extract plate text with 80%+ accuracy on clear plates

**Tasks:**
```
☐ Set up EasyOCR:
  pip install easyocr
  
☐ Create plate extraction logic:
  anpr_module/ocr.py:
    class PLATEExtractor:
        def __init__(self):
            self.reader = easyocr.Reader(['en', 'hi'])
        
        def extract_plate(self, frame, vehicle_bbox):
            # Estimate plate region (lower-middle of vehicle)
            x1, y1, x2, y2 = vehicle_bbox
            plate_region = frame[int(y1+0.6*(y2-y1)):int(y2), int(x1):int(x2)]
            
            # Run OCR
            results = self.reader.readtext(plate_region)
            plate_text = ''.join([r[1] for r in results if r[2] > 0.7])
            plate_confidence = sum([r[2] for r in results]) / len(results) if results else 0
            
            return plate_text, plate_confidence
        
        def validate_plate_format(self, plate_text):
            # Indian format: XX-XX-NN-NNNN or XX-XX-NNNN
            import re
            pattern = r'^[A-Z]{2}-[A-Z]{2}-[A-Z]{2}-\d{4}$|^[A-Z]{2}-\d{2}-[A-Z]{2}-\d{4}$'
            return bool(re.match(pattern, plate_text.upper()))
  
☐ Test on Indian plate samples:
  - Clear plates (day, good lighting)
  - Partially obscured (night, dirt)
  - Blurry/motion blur
  
  Expected accuracy:
  - Clear: ≥80%
  - Obscured: ≥60%
  
☐ Create preprocessing for better OCR:
  - Image contrast enhancement
  - Plate region rotation detection
  - Grayscale conversion
  
☐ Unit tests:
  tests/test_ocr.py
    - test_extract_valid_plate()
    - test_validate_format()
    - test_accuracy_on_benchmark()
```

**Success Criteria:**
- ✅ Extracts plate text from vehicles
- ✅ 80%+ accuracy on clear plates
- ✅ Confidence scores generated
- ✅ Format validation working

**Deliverables:**
- `anpr_module/ocr.py`
- Benchmark results (accuracy table)
- Sample images with extracted plates

**Time Estimate:** 2 days

---

### 3.3 Integration & Testing (Week 3, Day 1)

**Objective:** Combine detection + OCR into single ANPR pipeline

**Tasks:**
```
☐ Create unified ANPR engine:
  anpr_module/engine.py:
    class ANPREngine:
        def __init__(self, model_path):
            self.detector = VehicleDetector(model_path)
            self.plate_extractor = PLATEExtractor()
        
        def process_frame(self, frame, timestamp):
            detections = self.detector.detect(frame)
            
            results = []
            for det in detections:
                plate_text, confidence = self.plate_extractor.extract_plate(frame, det['bbox'])
                
                vehicle_info = {
                    'timestamp': timestamp,
                    'bbox': det['bbox'],
                    'vehicle_class': det['class_name'],
                    'vehicle_confidence': det['confidence'],
                    'plate': plate_text,
                    'plate_confidence': confidence,
                    'valid_plate': self.plate_extractor.validate_plate_format(plate_text)
                }
                results.append(vehicle_info)
            
            return results

☐ Test on full video:
  python test_anpr_pipeline.py --input sample.mp4 --output results.json
  
☐ Performance profiling:
  - FPS on single GPU
  - Memory usage
  - Bottleneck identification
  
☐ Create config file:
  config/anpr_config.yaml:
    detection:
      model: yolov8s.pt
      confidence_threshold: 0.5
    ocr:
      languages: [en, hi]
      confidence_threshold: 0.7
    processing:
      fps: 30
      max_batch_size: 8
```

**Success Criteria:**
- ✅ ANPR pipeline runs end-to-end
- ✅ Outputs detection + plate + confidence
- ✅ Processes at 2+ FPS
- ✅ Config-driven (no hardcoding)

**Deliverables:**
- `anpr_module/engine.py`
- `config/anpr_config.yaml`
- Test results (FPS, memory, accuracy)

**Time Estimate:** 1 day

---

## 4. Phase 2: Tracking & Linking (Week 4-5)

### 4.1 Single-Camera Tracking (Week 4)

**Objective:** Assign and maintain track IDs to vehicles

**Tasks:**
```
☐ Install ByteTrack:
  pip install yolox
  
☐ Create tracking wrapper:
  tracking_module/byte_tracker.py:
    from yolox.tracker import BYTETracker
    
    class TrackingEngine:
        def __init__(self, camera_id):
            self.camera_id = camera_id
            self.tracker = BYTETracker(
                frame_rate=30,
                track_thresh=0.5,
                track_buffer=30,
                match_thresh=0.8
            )
        
        def update(self, detections):
            # Convert detections to tracker format
            dets = np.array([d['bbox'] + [d['vehicle_confidence']] for d in detections])
            
            # Update tracker
            online_targets = self.tracker.update(dets)
            
            # Assign track IDs to detections
            tracked_detections = []
            for i, det in enumerate(detections):
                for track in online_targets:
                    # Match detection to track (by IOU)
                    if self._iou(det['bbox'], track.tlbr) > 0.5:
                        det['track_id'] = f"{self.camera_id}_track_{track.track_id}"
                        tracked_detections.append(det)
                        break
            
            return tracked_detections

☐ Test on video:
  python test_tracking.py --input sample.mp4
  Output: Each vehicle gets consistent track_id across frames
  
☐ Metrics:
  - Track ID consistency (same vehicle = same ID for 10+ frames)
  - MOTA (Multiple Object Tracking Accuracy)
  
☐ Unit tests:
  tests/test_tracking.py
    - test_assigns_track_ids()
    - test_maintains_consistency()
    - test_handles_occlusion()
```

**Success Criteria:**
- ✅ Vehicles get unique track IDs
- ✅ Track ID maintained across frames
- ✅ Handles occlusions (vehicle hidden <3 sec)

**Deliverables:**
- `tracking_module/byte_tracker.py`
- Test results with tracking metrics
- Sample output (tracked video)

**Time Estimate:** 2 days

---

### 4.2 Cross-Camera Linking (Week 4-5)

**Objective:** Connect vehicles across cameras into journeys

**Tasks:**
```
☐ Create linking algorithm:
  linking_module/trajectory_linker.py:
    class TrajectoryLinker:
        def __init__(self, camera_configs):
            self.cameras = camera_configs
            self.max_time_gap = 600  # 10 minutes
            self.max_speed = 40  # m/s (144 kmh)
        
        def link_vehicles(self, detections_by_camera, timestamp):
            """
            Input: Detections from all cameras
            Output: Trajectories (linked sequences)
            """
            
            # Build candidate pairs
            candidates = []
            cameras = list(detections_by_camera.keys())
            
            for i, cam_a in enumerate(cameras):
                for cam_b in cameras[i+1:]:
                    for det_a in detections_by_camera[cam_a]:
                        for det_b in detections_by_camera[cam_b]:
                            if self._should_link(det_a, det_b):
                                candidates.append((det_a, det_b))
            
            # Build trajectories from candidates
            trajectories = self._build_trajectories(candidates)
            
            return trajectories
        
        def _should_link(self, det_a, det_b):
            # Same plate (high confidence)
            if det_a.get('plate') == det_b.get('plate'):
                if det_a.get('plate_confidence', 0) > 0.8:
                    return True
            
            # Same attributes + feasible travel
            if self._same_attributes(det_a, det_b):
                if self._feasible_travel(det_a, det_b):
                    return True
            
            return False
        
        def _feasible_travel(self, det_a, det_b):
            time_gap = abs(det_b['timestamp'] - det_a['timestamp']).total_seconds()
            distance = self._distance(
                self.cameras[det_a['camera_id']]['position'],
                self.cameras[det_b['camera_id']]['position']
            )
            
            if time_gap == 0:
                return False
            
            speed = distance / time_gap
            return 0 < speed < self.max_speed and time_gap < self.max_time_gap
        
        def _build_trajectories(self, candidates):
            # Group linked detections into trajectories
            trajectories = []
            used = set()
            
            for det_a, det_b in candidates:
                if id(det_a) in used or id(det_b) in used:
                    continue
                
                traj = {
                    'plate': det_a.get('plate'),
                    'date': det_a['timestamp'].date(),
                    'sightings': [
                        {
                            'camera_id': det_a['camera_id'],
                            'timestamp': det_a['timestamp'],
                            'position': self.cameras[det_a['camera_id']]['position']
                        },
                        {
                            'camera_id': det_b['camera_id'],
                            'timestamp': det_b['timestamp'],
                            'position': self.cameras[det_b['camera_id']]['position']
                        }
                    ]
                }
                trajectories.append(traj)
                used.add(id(det_a))
                used.add(id(det_b))
            
            return trajectories

☐ Set up camera configuration:
  config/cameras.yaml:
    cameras:
      cam_1:
        name: "Sitabuldi Intersection"
        latitude: 21.1458
        longitude: 79.0882
        stop_line_y: 450
        pixels_per_meter: 2.5
        lanes: [100, 200, 300]
      cam_2:
        name: "Dhantoli Intersection"
        latitude: 21.1520
        longitude: 79.0890
        stop_line_y: 420
        pixels_per_meter: 2.3
        lanes: [110, 220, 330]

☐ Test linking:
  - Simulated detections from 2-3 cameras
  - Verify links are correct
  - Check for false positives
  
☐ Unit tests:
  tests/test_linking.py
    - test_links_same_plate()
    - test_links_same_attributes()
    - test_rejects_infeasible_travel()
```

**Success Criteria:**
- ✅ Correctly links vehicles across cameras (80%+ accuracy)
- ✅ False positive links <5%
- ✅ Handles edge cases (multiple cameras, same vehicle)

**Deliverables:**
- `linking_module/trajectory_linker.py`
- `config/cameras.yaml`
- Test results with linking accuracy metrics

**Time Estimate:** 3 days

---

### 4.3 Storage & Persistence (Week 5)

**Objective:** Store trajectories and enable queries

**Tasks:**
```
☐ Create database models (SQLAlchemy):
  models/trajectory.py:
    class Trajectory(Base):
        __tablename__ = "trajectories"
        id = Column(Integer, primary_key=True)
        plate = Column(String(20), index=True)
        date = Column(Date, index=True)
        vehicle_type = Column(String(50))
        vehicle_color = Column(String(50))
        created_at = Column(DateTime, default=datetime.utcnow)
        
        sightings = relationship("Sighting", cascade="all, delete-orphan")
    
    class Sighting(Base):
        __tablename__ = "sightings"
        id = Column(Integer, primary_key=True)
        trajectory_id = Column(Integer, ForeignKey("trajectories.id"), index=True)
        camera_id = Column(String(50), index=True)
        timestamp = Column(DateTime, index=True)
        latitude = Column(Float)
        longitude = Column(Float)
        direction = Column(String(20))

☐ Create repository layer:
  repositories/trajectory_repo.py:
    class TrajectoryRepository:
        def save_trajectory(self, trajectory):
            # Save to DB
            db_traj = Trajectory(
                plate=trajectory['plate'],
                date=trajectory['date'],
                vehicle_type=trajectory['vehicle_type']
            )
            for sighting in trajectory['sightings']:
                db_traj.sightings.append(Sighting(**sighting))
            db.session.add(db_traj)
            db.session.commit()
        
        def get_vehicle_journey(self, plate, date):
            return db.session.query(Trajectory).filter(
                Trajectory.plate == plate,
                Trajectory.date == date
            ).first()

☐ Set up migrations (Alembic):
  alembic init alembic
  alembic revision -m "Create trajectories table"
  alembic upgrade head

☐ Test persistence:
  - Save trajectory to DB
  - Query it back
  - Verify data integrity
```

**Success Criteria:**
- ✅ Trajectories persist in DB
- ✅ Can query by plate + date
- ✅ Queries return in <2 seconds

**Deliverables:**
- `models/trajectory.py`, `models/sighting.py`
- `repositories/trajectory_repo.py`
- Database migration scripts

**Time Estimate:** 1.5 days

---

## 5. Phase 3: Backend API (Week 6-7)

### 5.1 FastAPI Setup & Core Endpoints (Week 6)

**Objective:** Expose ANPR data via REST APIs

**Tasks:**
```
☐ Set up FastAPI project:
  pip install fastapi uvicorn sqlalchemy psycopg2-binary
  
☐ Create main app:
  api/main.py:
    from fastapi import FastAPI, Query
    from fastapi.responses import JSONResponse
    from fastapi.middleware.cors import CORSMiddleware
    import redis
    
    app = FastAPI(title="ANPR Traffic Engine API")
    
    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Redis connection
    redis_client = redis.Redis(host='localhost', port=6379)
    
    # Database
    engine = create_engine(os.getenv('DATABASE_URL'))
    SessionLocal = sessionmaker(bind=engine)

☐ Implement core endpoints:
  
  GET /api/vehicles/live
    Response: {
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
  
  GET /api/vehicles/search?plate=MH-31-AB-1234&date=2026-08-23
    Response: {
      "plate": "MH-31-AB-1234",
      "date": "2026-08-23",
      "sightings": [
        {
          "camera_id": "cam_1",
          "timestamp": "2026-08-23T08:15:30Z",
          "position": {"lat": 21.1458, "lng": 79.0882}
        }
      ]
    }
  
  GET /api/violations/alerts
    Response: {
      "violations": [
        {
          "violation_id": "vio_1001",
          "type": "red_light",
          "plate": "MH-31-AB-1234",
          "timestamp": "2026-08-23T10:32:15Z",
          "camera_id": "cam_3",
          "severity": "high"
        }
      ]
    }
  
  GET /api/congestion/heatmap?start_time=T1&end_time=T2
    Response: {
      "heatmap": {
        "grid": [[0.2, 0.5, 0.8], [0.3, 0.6, 0.9]],
        "timestamp": "2026-08-23T10:30:00Z"
      }
    }
  
  GET /api/reports/daily-volume?date=2026-08-23
    Response: {
      "date": "2026-08-23",
      "total_vehicles": 5234,
      "by_type": {"Car": 3100, "Truck": 890, ...}
    }

☐ Create response schemas (Pydantic):
  schemas/vehicle.py:
    from pydantic import BaseModel
    
    class Position(BaseModel):
        lat: float
        lng: float
    
    class VehicleResponse(BaseModel):
        track_id: str
        plate: str
        position: Position
        camera_id: str
        confidence: float
        type: str
        color: str
  
  schemas/violation.py:
    class ViolationResponse(BaseModel):
        violation_id: str
        type: str
        plate: str
        timestamp: str
        severity: str

☐ Add error handling:
  from fastapi import HTTPException
  
  @app.exception_handler(HTTPException)
  async def http_exception_handler(request, exc):
      return JSONResponse(
          status_code=exc.status_code,
          content={"error": exc.detail}
      )

☐ Test endpoints:
  pytest api/tests/test_endpoints.py

☐ Create API documentation (Swagger):
  - Auto-generated via FastAPI
  - Available at /docs
```

**Success Criteria:**
- ✅ All endpoints return correct data format
- ✅ Response times <2 seconds
- ✅ Swagger docs complete

**Deliverables:**
- `api/main.py`
- `api/schemas/` (Pydantic models)
- API tests
- Swagger documentation

**Time Estimate:** 2.5 days

---

### 5.2 Real-Time Cache & WebSocket (Week 6-7)

**Objective:** Enable live updates via WebSocket

**Tasks:**
```
☐ Set up Redis caching:
  api/cache.py:
    import redis
    import json
    
    redis_client = redis.Redis(host='localhost', port=6379)
    
    def cache_live_vehicles(vehicles):
        redis_client.set(
            'current_vehicles',
            json.dumps(vehicles),
            ex=5  # Expire in 5 seconds
        )
    
    def cache_violation_alert(violation):
        redis_client.lpush(
            'violation_alerts',
            json.dumps(violation)
        )
        # Keep only last 100 alerts
        redis_client.ltrim('violation_alerts', 0, 99)
    
    def get_live_vehicles():
        data = redis_client.get('current_vehicles')
        return json.loads(data) if data else []

☐ Implement WebSocket for live updates:
  from fastapi import WebSocket
  
  active_connections: List[WebSocket] = []
  
  @app.websocket("/ws/vehicles")
  async def websocket_endpoint(websocket: WebSocket):
      await websocket.accept()
      active_connections.append(websocket)
      
      try:
          while True:
              # Broadcast vehicle updates every 500ms
              vehicles = get_live_vehicles()
              await websocket.send_json(vehicles)
              await asyncio.sleep(0.5)
      except Exception as e:
          active_connections.remove(websocket)

☐ Create background task to update cache:
  from fastapi_background_tasks import BackgroundTasks
  
  async def update_live_cache():
      while True:
          # Get current detections from tracking engine
          detections = get_current_detections()
          cache_live_vehicles(detections)
          await asyncio.sleep(0.5)
  
  @app.on_event("startup")
  async def startup_event():
      asyncio.create_task(update_live_cache())

☐ Test WebSocket:
  tests/test_websocket.py:
    - Connect to WebSocket
    - Receive updates
    - Verify data freshness
```

**Success Criteria:**
- ✅ WebSocket updates every 500ms
- ✅ Cache updates in real-time
- ✅ No data loss on reconnect

**Deliverables:**
- `api/cache.py`
- WebSocket endpoint in `api/main.py`
- Cache tests

**Time Estimate:** 1.5 days

---

### 5.3 Violation Detection API (Week 7)

**Objective:** Expose violation detection rules

**Tasks:**
```
☐ Create violation service:
  services/violation_service.py:
    class ViolationService:
        def __init__(self, camera_configs):
            self.detector = ViolationDetector(camera_configs)
        
        def check_violations(self, tracked_detections, signal_states):
            violations = []
            
            # Check red-light
            red_lights = self.detector.detect_red_light(
                tracked_detections,
                signal_states
            )
            violations.extend(red_lights)
            
            # Check lane violations
            lane_viols = self.detector.detect_lane_violation(
                tracked_detections,
                self.lane_markings
            )
            violations.extend(lane_viols)
            
            # Save to DB + cache
            for viol in violations:
                self.save_violation(viol)
                cache_violation_alert(viol)
            
            return violations
        
        def save_violation(self, violation):
            db_viol = Violation(
                type=violation['type'],
                plate=violation['plate'],
                camera_id=violation['camera_id'],
                timestamp=violation['timestamp'],
                severity=violation['severity']
            )
            db.session.add(db_viol)
            db.session.commit()

☐ Expose violation endpoint:
  GET /api/violations/summary?start_date=D1&end_date=D2
    Response: {
      "total_violations": 342,
      "by_type": {"red_light": 180, "lane_violation": 98, ...},
      "by_severity": {"high": 180, "medium": 98, "low": 64}
    }

☐ Integration tests:
  tests/test_violations.py
    - test_detects_red_light_violation()
    - test_detects_lane_violation()
    - test_saves_to_db()
```

**Success Criteria:**
- ✅ Violations detected in real-time
- ✅ Saved to database
- ✅ API queries work

**Deliverables:**
- `services/violation_service.py`
- Violation endpoints in `api/main.py`
- Violation tests

**Time Estimate:** 1 day

---

## 6. Phase 4: Dashboard Frontend (Week 8-9)

### 6.1 React Setup & Components (Week 8)

**Objective:** Build interactive UI for live dashboard

**Tasks:**
```
☐ Initialize React project:
  npx create-react-app frontend
  cd frontend
  npm install axios leaflet react-leaflet
  npm install @mui/material @mui/icons-material
  npm install chart.js react-chartjs-2
  npm install tailwindcss postcss autoprefixer

☐ Create component structure:
  src/
  ├── components/
  │   ├── Header.jsx
  │   ├── Sidebar.jsx
  │   ├── Dashboard.jsx
  │   ├── Map.jsx
  │   ├── Stats.jsx
  │   ├── ViolationFeed.jsx
  │   ├── SearchVehicle.jsx
  │   └── Reports.jsx
  ├── pages/
  │   ├── Home.jsx
  │   ├── ViolationDetails.jsx
  │   └── ReportPage.jsx
  ├── services/
  │   ├── api.js (Axios instance)
  │   └── websocket.js
  ├── hooks/
  │   ├── useWebSocket.js
  │   └── useApi.js
  ├── App.jsx
  └── index.css

☐ Create layout:
  components/Layout.jsx:
    export function Layout({ children }) {
      return (
        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1">
            <Header />
            <div className="p-4">
              {children}
            </div>
          </main>
        </div>
      );
    }

☐ Build dashboard components:
  
  components/Map.jsx:
    - Use react-leaflet
    - Show camera markers
    - Show vehicle positions (icons)
    - Heatmap overlay (conditional)
  
  components/Stats.jsx:
    - Display key metrics
    - Use material-ui Cards
    - Auto-update from API
  
  components/ViolationFeed.jsx:
    - Scrollable list of violations
    - Color-coded by severity
    - Click to view details

☐ Create API service:
  services/api.js:
    import axios from 'axios';
    
    const API_BASE = 'http://localhost:8000/api';
    
    export const apiClient = axios.create({
      baseURL: API_BASE,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    export const getVehicles = () => apiClient.get('/vehicles/live');
    export const getViolations = () => apiClient.get('/violations/alerts');
    export const searchVehicle = (plate, date) =>
      apiClient.get(`/vehicles/search?plate=${plate}&date=${date}`);

☐ Test components:
  tests/Dashboard.test.jsx
    - test_renders_map()
    - test_renders_stats()
    - test_renders_violations()
```

**Success Criteria:**
- ✅ React app builds without errors
- ✅ Components render
- ✅ Can connect to backend API

**Deliverables:**
- React app structure
- Basic components (Header, Sidebar, Dashboard)
- API service layer
- Component tests

**Time Estimate:** 2.5 days

---

### 6.2 Dashboard Features & Styling (Week 9)

**Objective:** Complete dashboard UI and styling

**Tasks:**
```
☐ Implement real-time updates:
  hooks/useWebSocket.js:
    import { useEffect, useState } from 'react';
    
    export function useWebSocket(url) {
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      
      useEffect(() => {
        const ws = new WebSocket(url);
        
        ws.onmessage = (event) => {
          setData(JSON.parse(event.data));
        };
        
        ws.onerror = (event) => {
          setError(event.error);
        };
        
        return () => ws.close();
      }, [url]);
      
      return { data, error };
    }
  
  components/Dashboard.jsx:
    const { data: vehicles } = useWebSocket('ws://localhost:8000/ws/vehicles');
    useEffect(() => {
      // Update map with new vehicle positions
    }, [vehicles]);

☐ Implement dark theme:
  styles/theme.js:
    export const darkTheme = {
      bg: '#1a1a1a',
      surface: '#2d2d2d',
      text: '#ffffff',
      textSecondary: '#a0a0a0',
      green: '#22c55e',
      yellow: '#eab308',
      red: '#ef4444'
    };
  
  src/index.css:
    body {
      background-color: #1a1a1a;
      color: #ffffff;
    }

☐ Add responsiveness:
  - Mobile-first approach (Tailwind CSS)
  - Breakpoints: 320px, 768px, 1024px, 1920px
  - Test on actual devices

☐ Implement search functionality:
  components/SearchVehicle.jsx:
    - Input plate number
    - Pick date
    - Show journey on map
    - Display sightings list

☐ Add animations:
  - Vehicle movement (smooth transitions)
  - Alert notifications (slide in/out)
  - Loading spinners
  - Hover effects

☐ Test on multiple screen sizes:
  - Desktop (1920x1080)
  - Tablet (768x1024)
  - Mobile (375x667)
```

**Success Criteria:**
- ✅ Dashboard displays real-time data
- ✅ Dark theme applied
- ✅ Responsive on all screen sizes
- ✅ Smooth animations

**Deliverables:**
- Complete Dashboard.jsx
- useWebSocket hook
- Dark theme configuration
- Component styles (Tailwind)
- Mobile responsive layout

**Time Estimate:** 2 days

---

## 7. Phase 5: Violation Detection & Reporting (Week 10)

### 7.1 Rule Engine & Alert System

**Objective:** Detect violations and alert operators

**Tasks:**
```
☐ Finalize violation detection:
  - Red-light crossing (signal integration)
  - Lane violations (lane marking detection)
  - Speed estimation (calibration)

☐ Create alert system:
  services/alert_service.py:
    def send_alert(violation):
      # Save to DB
      save_violation(violation)
      
      # Cache for dashboard
      cache_violation_alert(violation)
      
      # Email (optional, for critical violations)
      if violation['severity'] == 'HIGH':
        send_email_alert(violation)

☐ Implement reports:
  services/report_service.py:
    class ReportService:
      def daily_volume_report(self, date):
        # Query DB, aggregate, return summary
        pass
      
      def congestion_report(self, start_date, end_date):
        # Generate heatmap data
        pass
      
      def violation_report(self, start_date, end_date):
        # Summary of violations, top offenders
        pass

☐ Test reporting endpoints:
  GET /api/reports/daily-volume?date=2026-08-23
  GET /api/reports/congestion-heatmap?start_date=2026-08-16&end_date=2026-08-23
  GET /api/reports/violations-summary?start_date=2026-08-16&end_date=2026-08-23
```

**Success Criteria:**
- ✅ Violations detected in real-time
- ✅ Alerts sent to dashboard
- ✅ Reports generate correctly

**Deliverables:**
- Alert system implementation
- Report service
- Report endpoints tested

**Time Estimate:** 2 days

---

### 7.2 Export & Download Features

**Objective:** Allow users to export data

**Tasks:**
```
☐ Add export to CSV:
  services/export_service.py:
    import csv
    
    def export_to_csv(violations, filename):
      with open(filename, 'w') as f:
        writer = csv.DictWriter(f, fieldnames=['plate', 'type', 'timestamp', 'severity'])
        writer.writeheader()
        writer.writerows(violations)

☐ Add export to PDF:
  pip install reportlab
  
  def export_to_pdf(violations, filename):
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Table
    
    doc = SimpleDocTemplate(filename, pagesize=letter)
    data = [['Plate', 'Type', 'Timestamp', 'Severity']]
    data.extend([[v['plate'], v['type'], v['timestamp'], v['severity']] for v in violations])
    
    table = Table(data)
    doc.build([table])

☐ Create download endpoints:
  GET /api/reports/violations-summary/export?format=csv&start_date=D1&end_date=D2
  GET /api/reports/violations-summary/export?format=pdf&start_date=D1&end_date=D2

☐ Frontend download button:
  components/ReportPage.jsx:
    const handleExport = async (format) => {
      const res = await apiClient.get(`/reports/violations-summary/export?format=${format}`);
      // Trigger download
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report.${format}`);
      document.body.appendChild(link);
      link.click();
    };
```

**Success Criteria:**
- ✅ Export to CSV works
- ✅ Export to PDF works
- ✅ Download button functional

**Deliverables:**
- Export service
- Download endpoints
- Frontend download buttons

**Time Estimate:** 1 day

---

## 8. Phase 6: Testing, Optimization, Documentation (Week 11-12)

### 8.1 Unit & Integration Testing

**Objective:** Ensure all components work correctly

**Tasks:**
```
☐ Backend unit tests:
  - ANPR accuracy
  - Tracking consistency
  - Linking correctness
  - Violation detection
  - API responses
  
  Target: ≥70% code coverage
  
  Command: pytest --cov=api tests/

☐ Frontend component tests:
  - Dashboard rendering
  - API integration
  - User interactions
  
  Command: npm test

☐ Integration tests:
  - End-to-end flow: camera → ANPR → tracking → linking → DB → API → UI
  - E2E testing with Selenium/Cypress
  
  tests/e2e/full_flow.py:
    - Start camera feed
    - Process frame
    - Check dashboard update
    - Verify DB insert
```

**Success Criteria:**
- ✅ Unit test coverage ≥70%
- ✅ All E2E tests pass
- ✅ No critical bugs

**Time Estimate:** 1.5 days

---

### 8.2 Performance Optimization

**Objective:** Ensure system handles load

**Tasks:**
```
☐ Backend optimization:
  - Profile code: python -m cProfile
  - Optimize hot paths
  - Cache frequently accessed data
  - Batch database queries
  
  Performance targets:
  - ANPR: 2+ FPS on 5 cameras
  - API response: <2 seconds
  - Dashboard latency: <500ms

☐ Frontend optimization:
  - Code splitting (lazy load components)
  - Image optimization (compress, webp)
  - CSS/JS minification
  
  npm run build  # Production build

☐ Database optimization:
  - Add indexes
  - Analyze query plans
  - Partition tables by date
  
  CREATE INDEX idx_plate_timestamp ON detections(plate, timestamp);

☐ Load testing:
  pip install locust
  
  # Simulate 100 concurrent users
  locust -f tests/load_test.py --users 100 --spawn-rate 10
```

**Success Criteria:**
- ✅ ANPR: 2+ FPS sustained
- ✅ API: <2 second response under load
- ✅ Dashboard: <500ms latency
- ✅ No out-of-memory errors

**Deliverables:**
- Performance benchmarks
- Load test results
- Optimization recommendations

**Time Estimate:** 1.5 days

---

### 8.3 Documentation

**Objective:** Complete project documentation

**Tasks:**
```
☐ API Documentation:
  - Swagger (auto-generated)
  - README with setup instructions
  - Example API calls (curl, Python, JavaScript)
  
  docs/API.md:
    # ANPR Traffic Engine API
    ## Base URL: http://localhost:8000/api
    ## Authentication: Bearer token
    ## Example:
      curl -H "Authorization: Bearer token" \
           http://localhost:8000/api/vehicles/live

☐ Architecture Documentation:
  - System design (copy from 03_ARCHITECTURE_ANPR.md)
  - Data flow diagrams
  - Database schema
  - Deployment guide
  
  docs/ARCHITECTURE.md

☐ Development Guide:
  - Local setup instructions
  - How to add new camera
  - How to add new violation rule
  - Model training guide (ANPR)
  
  docs/DEVELOPMENT.md:
    # Setup Local Development
    1. Clone repo
    2. Create virtual environment
    3. pip install -r backend/requirements.txt
    4. docker-compose up
    5. python manage.py init_db
    6. python api/main.py

☐ User Guide:
  - Dashboard walkthrough
  - How to search vehicle
  - How to generate reports
  - How to export data
  
  docs/USER_GUIDE.md

☐ Code comments:
  - Document complex functions
  - Add docstrings to classes
  - Inline comments for non-obvious logic

☐ README.md (project root):
  # ANPR Traffic Intelligence Engine
  
  City-wide AI engine for multi-camera ANPR trajectory tracking and urban traffic analytics.
  
  ## Features
  - Real-time vehicle detection & plate recognition
  - Multi-camera trajectory tracking
  - Violation detection (red-light, lane, speed)
  - Live dashboard with heatmaps
  - Historical reporting & analytics
  
  ## Quick Start
  ```bash
  git clone ...
  cd anpr-traffic-engine
  docker-compose up
  python api/main.py
  npm start (in frontend directory)
  ```
  
  ## Documentation
  - [API Docs](docs/API.md)
  - [Architecture](docs/ARCHITECTURE.md)
  - [Setup Guide](docs/DEVELOPMENT.md)
  - [User Guide](docs/USER_GUIDE.md)
```

**Success Criteria:**
- ✅ README is complete and clear
- ✅ API docs generated (Swagger)
- ✅ Setup guide allows new developers to start in <30 min
- ✅ All functions documented

**Deliverables:**
- README.md (complete)
- docs/API.md
- docs/ARCHITECTURE.md
- docs/DEVELOPMENT.md
- docs/USER_GUIDE.md
- Code comments/docstrings

**Time Estimate:** 1 day

---

### 8.4 Demo Preparation & Final Polish

**Objective:** Prepare for SIH jury submission

**Tasks:**
```
☐ Create demo script:
  - Start with sample video
  - Show ANPR detection + plate recognition
  - Show tracking across frames
  - Show linking across cameras
  - Show live dashboard
  - Show violation alerts
  - Show reports
  
  Duration: 5-7 minutes

☐ Prepare demo data:
  - High-quality sample video (2-3 minutes)
  - Pre-populated database with test data
  - Test violations ready to show
  
  Option: Use public dataset (BDD100K) or record custom video

☐ Create presentation slides:
  - Problem statement
  - Solution architecture
  - Key features demo
  - Results & metrics
  - Future scope
  
  Recommendation: 10-15 slides

☐ Bug fixes:
  - Test all critical flows
  - Fix any UI glitches
  - Verify all APIs respond correctly
  
  Checklist:
  ☐ Dashboard loads without errors
  ☐ Map displays correctly
  ☐ Violations appear in real-time
  ☐ Search works
  ☐ Reports generate
  ☐ No console errors

☐ Performance final check:
  - Measure ANPR speed
  - Measure API latency
  - Measure dashboard responsiveness
  
  Goals:
  ✅ ANPR: 2+ FPS
  ✅ API: <2 seconds
  ✅ Dashboard: <500ms

☐ Create GitHub release:
  - Tag version (v1.0.0)
  - Write release notes
  - Include setup instructions
```

**Success Criteria:**
- ✅ Demo runs smoothly (no crashes)
- ✅ All features working
- ✅ Jury can understand the system quickly
- ✅ Code is clean and documented

**Deliverables:**
- Demo script (step-by-step instructions)
- Presentation slides (PowerPoint/PDF)
- Demo video (if desired)
- GitHub release with documentation

**Time Estimate:** 1.5 days

---

## 9. Team Structure & Roles (if applicable)

| Role | Responsibilities | Skills Needed |
|------|------------------|---------------|
| **ML Engineer** | ANPR training, tracking setup, optimization | Python, YOLOv8, Deep Learning |
| **Backend Engineer** | FastAPI, database, API endpoints | Python, FastAPI, PostgreSQL, Redis |
| **Frontend Engineer** | React dashboard, maps, UI/UX | React, Tailwind, Leaflet.js |
| **DevOps/Infra** | Docker, deployment, monitoring | Docker, Linux, CI/CD |
| **QA/Testing** | Test plans, bug reporting, performance testing | pytest, Selenium, load testing |
| **Project Lead** | Coordination, documentation, demo | Project management, communication |

---

## 10. Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| ANPR accuracy lower than expected | High | Start with synthetic data; use transfer learning on domain-specific dataset |
| GPU memory bottleneck | High | Use model quantization (INT8); start with fewer cameras |
| Trajectory linking false positives | Medium | Implement confidence thresholds; manual review for low-confidence links |
| Dashboard latency | Medium | Use caching (Redis); WebSocket instead of polling |
| Database query performance | Medium | Add indexes; partition tables by date |
| Time constraints | High | Prioritize MVP scope; drop Phase 2 features if needed |

---

## 11. Success Criteria (Final Validation)

### 11.1 Functional Requirements Met
- ✅ ANPR module detects vehicles with ≥85% accuracy
- ✅ Plates extracted with ≥75% accuracy on test video
- ✅ Trajectory tracking maintains consistency across frames
- ✅ Cross-camera linking ≥80% accuracy
- ✅ Violation detection <60s latency
- ✅ Dashboard updates in real-time (<2s)
- ✅ Reports generate in <15s
- ✅ API responses <2 seconds

### 11.2 Code Quality
- ✅ Clean, modular code (functions <50 lines)
- ✅ Unit test coverage ≥70%
- ✅ All functions documented
- ✅ No hardcoded values (use config files)
- ✅ Error handling in place

### 11.3 Documentation
- ✅ README complete with setup instructions
- ✅ API documentation (Swagger)
- ✅ Architecture document
- ✅ User guide for operators
- ✅ Code comments/docstrings

### 11.4 Demo Quality
- ✅ Runs smoothly without crashes
- ✅ Jury can understand system in <10 minutes
- ✅ All key features demonstrated
- ✅ Performance metrics shown

---

## 12. Go-Live Checklist (Week 12)

```
Final Validation:
☐ All unit tests pass (pytest --cov)
☐ All E2E tests pass
☐ Load test: 100 users, no errors
☐ Performance benchmarks met
☐ Security: No hardcoded credentials
☐ No console errors in browser
☐ Swagger docs generated
☐ README updated
☐ GitHub repo clean (no large files, no secrets)
☐ Demo video recorded (optional)
☐ Presentation slides finalized
☐ Jury feedback questionnaire prepared

Submission:
☐ Push final code to GitHub
☐ Tag release (v1.0.0)
☐ Create GitHub release with documentation
☐ Submit GitHub link to SIH portal
☐ Prepare demo environment (DB pre-populated, sample videos ready)
☐ Test demo on projector/large screen
```

---

**End of Development Plan**

This is your complete 12-week roadmap for building the SIH 2026 ANPR project. Adjust timelines based on team size and skill level. Focus on getting the MVP working first; features can be refined later.

**Next Step:** Start Phase 0 (Week 1) with repo setup and environment configuration!

Good luck! 🚀
