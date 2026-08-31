from typing import List
import tempfile
import os
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session

from api.schemas import CameraOut
from db.database import get_db
from db.models import Camera
from utils.config import cameras as camera_config
from simulation.pipeline import ProcessingPipeline

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


@router.get("", response_model=List[CameraOut], summary="List all cameras")
def list_cameras(db: Session = Depends(get_db)):
    rows = db.query(Camera).all()
    if rows:
        return [r.to_dict() for r in rows]
    # fallback to config if the DB has not been seeded yet
    return [{
        "id": cid,
        "name": c.get("name"),
        "position": {"lat": c.get("latitude"), "lng": c.get("longitude")},
        "speed_limit_kmh": c.get("speed_limit_kmh"),
        "lanes": c.get("lanes", []),
    } for cid, c in camera_config().items()]


@router.post("/{camera_id}/upload-video", summary="Upload a video to process frame-by-frame ANPR")
def upload_video_endpoint(
    camera_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a short video clip, decode it frame-by-frame with OpenCV, and run
    it through the processing pipeline (YOLO detection, EasyOCR, Speed checks, and
    Violations) as if it were a live camera feed.
    """
    cams = camera_config()
    if camera_id not in cams:
        raise HTTPException(status_code=404, detail=f"Camera '{camera_id}' not found in configuration.")

    # Save uploaded file to a temporary file
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"upload_{camera_id}_{file.filename}")
    try:
        with open(temp_path, "wb") as f:
            f.write(file.file.read())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

    cap = None
    try:
        import cv2
        cap = cv2.VideoCapture(temp_path)
        if not cap.isOpened():
            raise ValueError("Failed to open video file. Ensure it is a valid video format.")

        # Get video frame rate (FPS)
        fps = cap.get(cv2.CAP_PROP_FPS)
        if not fps or fps <= 0:
            fps = 30.0

        # Initialize ProcessingPipeline
        pipeline = ProcessingPipeline(cameras=cams)
        
        all_detections = []
        all_violations = []

        # Process 2 frames per second to keep it fast and responsive
        frame_interval = max(1, int(fps / 2))
        
        frame_idx = 0
        start_time = datetime.now()

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # Process frames at the specified interval
            if frame_idx % frame_interval == 0:
                timestamp = start_time + timedelta(seconds=(frame_idx / fps))
                
                # Process the frame through our main system pipeline
                dets, alerts = pipeline.process_frame(
                    db,
                    camera_id=camera_id,
                    frame=frame,
                    timestamp=timestamp,
                    publish=True,
                    track=True
                )
                
                # Format results for the return payload
                for d in dets:
                    d_copy = {k: v for k, v in d.items() if not k.startswith("_")}
                    d_copy["timestamp"] = timestamp.isoformat() + "Z"
                    all_detections.append(d_copy)
                    
                for a in alerts:
                    all_violations.append({
                        "id": a.violation_id,
                        "type": a.violation_type,
                        "plate": a.plate_text,
                        "timestamp": a.timestamp.isoformat() + "Z",
                        "severity": a.severity,
                        "camera_id": a.camera_id,
                    })

            frame_idx += 1
            # Cap processing to the first 30 seconds to prevent resource lockups
            if frame_idx > fps * 30:
                break

        # Commit all detections & violations created by the pipeline
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error processing video: {str(e)}")
    finally:
        if cap is not None:
            cap.release()
        if os.path.exists(temp_path):
            os.remove(temp_path)

    return {
        "status": "success",
        "camera_id": camera_id,
        "processed_frames": frame_idx // frame_interval,
        "detections": all_detections,
        "violations": all_violations,
    }
