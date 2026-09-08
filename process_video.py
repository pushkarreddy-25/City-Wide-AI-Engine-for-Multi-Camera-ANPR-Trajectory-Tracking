"""ANPR Traffic Engine - Optimized YOLO11 + EasyOCR Video Processor

Runs optimized YOLO11 vehicle/plate detection and EasyOCR character recognition
with GPU auto-acceleration, frame-skipping, ROI pre-processing, and character allowlisting.
"""
import sys
import os
import cv2
import time
import torch
from ultralytics import YOLO
import easyocr

# COCO vehicle class IDs: 2=Car, 3=Motorcycle, 5=Bus, 7=Truck
VEHICLE_CLASSES = [2, 3, 5, 7]
# EasyOCR character allowlist to restrict search space and boost performance
PLATE_ALLOWLIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"

def preprocess_plate_crop(crop):
    """Enhance license plate ROI for faster & more accurate OCR."""
    if crop is None or crop.size == 0:
        return None
    # Convert to grayscale
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    # Resize small crops up to standard height for OCR accuracy
    h, w = gray.shape[:2]
    if h < 48:
        scale = 48.0 / h
        gray = cv2.resize(gray, (int(w * scale), 48), interpolation=cv2.INTER_CUBIC)
    return gray

def main():
    video_path = sys.argv[1] if len(sys.argv) > 1 else "traffic_video.mp4"
    frame_skip = int(sys.argv[2]) if len(sys.argv) > 2 else 2  # Process 1 out of N frames
    
    # Fallback to backend sample video if default video file not found
    if not os.path.exists(video_path) and os.path.exists("backend/static/sample_traffic.mp4"):
        video_path = "backend/static/sample_traffic.mp4"
        print(f"Using fallback sample video: {video_path}")
    
    if not os.path.exists(video_path):
        print(f"Error: Video file '{video_path}' not found.")
        print("Usage: python process_video.py <video_path> [frame_skip]")
        sys.exit(1)

    # 1. Device Selection & Hardware Acceleration
    use_gpu = torch.cuda.is_available()
    device = "cuda" if use_gpu else "cpu"
    if not use_gpu:
        # Utilize maximum CPU logical threads for PyTorch intra-op ops
        torch.set_num_threads(os.cpu_count() or 4)

    print(f"[1/4] Loading YOLO11 model (yolo11n.pt) on {device.upper()}...")
    model = YOLO("yolo11n.pt")

    print(f"[2/4] Initializing EasyOCR reader (GPU={use_gpu})...")
    reader = easyocr.Reader(['en'], gpu=use_gpu)

    print(f"[3/4] Opening video stream: {video_path}")
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(f"Error: Failed to open video source '{video_path}'.")
        sys.exit(1)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"[4/4] Processing (Total: {total_frames} frames, FPS: {fps:.1f}, Skip Rate: 1/{frame_skip})...\n")

    frame_count = 0
    processed_count = 0
    detections_found = 0
    ocr_skipped_count = 0
    start_time = time.time()
    
    # Store {track_id: plate_text} to eliminate duplicate OCR calls for tracked vehicles
    processed_plates = {}

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        frame_count += 1
        # Skip frames to match processing budget
        if frame_count % frame_skip != 0:
            continue
            
        processed_count += 1
        h, w = frame.shape[:2]

        # Track objects across frames using ByteTrack persistent tracker
        results = model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=VEHICLE_CLASSES,
            conf=0.4,
            imgsz=640,
            device=device,
            verbose=False,
            half=use_gpu  # FP16 acceleration on GPU
        )

        for result in results:
            boxes = result.boxes
            if boxes is None or len(boxes) == 0:
                continue

            track_ids = boxes.id.int().cpu().tolist() if boxes.id is not None else [None] * len(boxes)
            xyxy_boxes = boxes.xyxy.int().cpu().tolist()

            for box, track_id in zip(xyxy_boxes, track_ids):
                # If we already got a highly confident read for this vehicle track_id, skip OCR
                if track_id is not None and track_id in processed_plates:
                    ocr_skipped_count += 1
                    continue

                x1, y1, x2, y2 = box
                x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)

                # License plate ROI: lower half of vehicle bounding box
                box_h = y2 - y1
                py1 = int(y1 + 0.5 * box_h) if box_h > 40 else y1
                cropped_plate = frame[py1:y2, x1:x2]

                if cropped_plate.size == 0:
                    continue

                # Preprocess crop for faster & clearer character recognition
                prep_crop = preprocess_plate_crop(cropped_plate)

                # Extract text using allowlist to restrict search space
                ocr_results = reader.readtext(
                    prep_crop,
                    allowlist=PLATE_ALLOWLIST,
                    detail=1,
                    paragraph=False
                )

                for res in ocr_results:
                    text = res[1].strip().replace(" ", "").upper()
                    ocr_conf = float(res[2])
                    if len(text) >= 3 and ocr_conf >= 0.35:
                        detections_found += 1
                        timestamp_sec = frame_count / fps
                        
                        if track_id is not None:
                            processed_plates[track_id] = text
                            print(f"[Frame {frame_count:04d} | {timestamp_sec:.2f}s] Vehicle ID {track_id} -> Plate: {text:<12} (Conf: {ocr_conf:.2f})")
                        else:
                            print(f"[Frame {frame_count:04d} | {timestamp_sec:.2f}s] Plate: {text:<12} (Box: [{x1}, {y1}, {x2}, {y2}], Conf: {ocr_conf:.2f})")

    cap.release()
    elapsed = time.time() - start_time
    effective_fps = processed_count / elapsed if elapsed > 0 else 0
    print(f"\nProcessing complete in {elapsed:.2f}s ({effective_fps:.1f} FPS)!")
    print(f"Total Video Frames: {frame_count} | Processed: {processed_count} | Unique Vehicles Tracked: {len(processed_plates)}")
    print(f"License Plates Extracted: {detections_found} | Duplicate OCR Calls Skipped: {ocr_skipped_count}")

if __name__ == "__main__":
    main()

