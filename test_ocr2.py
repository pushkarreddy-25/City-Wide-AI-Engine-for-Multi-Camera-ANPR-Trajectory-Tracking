import cv2
from ultralytics import YOLO

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
        
    model = YOLO("yolov8n.pt")
    results = model(frame, verbose=False)
    
    found = 0
    for r in results:
        for box in r.boxes:
            cls = int(box.cls.item())
            conf = float(box.conf.item())
            print(f"Detected class {cls} with conf {conf}")
            found += 1
            
    print(f"Total found: {found}")
            
if __name__ == "__main__":
    test_ocr()
