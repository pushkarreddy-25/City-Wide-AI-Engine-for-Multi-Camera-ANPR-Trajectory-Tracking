import cv2
import easyocr
import sys

def test_ocr():
    video_path = "backend/static/sample_traffic.mp4"
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("Failed to open video")
        return
        
    ret, frame = cap.read()
    if not ret:
        print("Failed to read frame")
        return
        
    from ultralytics import YOLO
    model = YOLO("yolov8n.pt")
    results = model(frame, verbose=False)
    
    reader = easyocr.Reader(['en'])
    
    for r in results:
        for box in r.boxes:
            cls = int(box.cls.item())
            conf = float(box.conf.item())
            if cls not in {2, 3, 5, 7} or conf < 0.5:
                continue
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            py1 = int(y1 + 0.55 * (y2 - y1))
            crop = frame[py1:y2, x1:x2]
            
            print(f"Vehicle Crop size: {crop.shape}")
            if crop.size > 0:
                ocr_res = reader.readtext(crop)
                print(f"OCR results: {ocr_res}")
                
if __name__ == "__main__":
    test_ocr()
