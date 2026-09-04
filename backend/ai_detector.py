import cv2
from ultralytics import YOLO

class AIDetector:
    def __init__(self):
        # Uses lightweight nano weights (downloads automatically on first run)
        self.model = YOLO("yolov8n.pt")

    def count_people_from_frame(self, image_bytes: bytes) -> int:
        import numpy as np
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return 0
        
        results = self.model(frame, classes=[0], verbose=False) # class 0 is 'person'
        return len(results[0].boxes)

detector = AIDetector()