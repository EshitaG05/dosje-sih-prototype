import cv2
import subprocess

# Open local webcam (0 is default camera)
cap = cv2.VideoCapture(0)
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480

# Stream directly to MediaMTX using built-in Windows media tools or FFmpeg
# If FFmpeg is installed:
cmd = [
    'ffmpeg',
    '-y',
    '-f', 'rawvideo',
    '-vcodec', 'rawvideo',
    '-pix_fmt', 'bgr24',
    '-s', f'{width}x{height}',
    '-r', '20',
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'ultrafast',
    '-f', 'rtsp',
    'rtsp://localhost:8554/asha_kiran_live'
]

proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

print("Streaming webcam to MediaMTX... Press 'q' to quit.")
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
    proc.stdin.write(frame.tobytes())