import cv2
from ultralytics import YOLO

def test_ocr():
    video_path = "backend/static/sample_traffic.mp4"
    cap = cv2.VideoCapture(video_path)
    
    model = YOLO("yolov8n.pt")
    
    for i in range(30):
        ret, frame = cap.read()
        if not ret: break
        
        results = model(frame, verbose=False)
        found = 0
        for r in results:
            for box in r.boxes:
                cls = int(box.cls.item())
                conf = float(box.conf.item())
                if cls in {2, 3, 5, 7} and conf >= 0.5:
                    found += 1
        print(f"Frame {i}: found {found}")
            
if __name__ == "__main__":
    test_ocr()
