import os
import cv2
import numpy as np
from fastapi.testclient import TestClient
from api.main import app

def run_test():
    # 1. Create a tiny valid dummy MP4 video file
    temp_video_path = "dummy_test_video.mp4"
    print("Generating dummy video file...")
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_video_path, fourcc, 30.0, (100, 100))
    for _ in range(30): # 30 frames at 30fps = 1 second
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        out.write(frame)
    out.release()
    print("Video file generated successfully.")

    # 2. POST the video to the FastAPI test client
    print("Initializing test client...")
    client = TestClient(app)
    
    print("Uploading video...")
    try:
        with open(temp_video_path, "rb") as f:
            response = client.post("/api/cameras/cam_1/upload-video", files={"file": f})
        
        print("\n=== TEST RESULTS ===")
        print("STATUS CODE:", response.status_code)
        if response.status_code == 200:
            print("RESPONSE BODY:", response.json())
        else:
            print("ERROR DETAIL:", response.text)
    except Exception as e:
        print("EXCEPTION RAISED:", str(e))
    finally:
        # Cleanup
        if os.path.exists(temp_video_path):
            os.remove(temp_video_path)

if __name__ == "__main__":
    run_test()
