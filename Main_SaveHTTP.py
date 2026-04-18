#!/usr/bin/env python3


import paho.mqtt.client as mqtt
from picamera2 import Picamera2
from picamera2.encoders import JpegEncoder, H264Encoder
from picamera2.outputs import FileOutput
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from PIL import Image
import io
import os
import json
import base64
import threading
import time
import socket
import subprocess 
import numpy as np


# ============================================================
# SETTINGS
# ============================================================
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_CLIENT_ID = "veljko-camera-main"

HTTP_PORT = 8080

RESOLUTION = (1280, 720)
JPEG_QUALITY = 80
VIDEO_BITRATE = 5000000

SAVE_FOLDER = "/home/gorannik/veljko-diplomski/recordings"
EVENTS_FOLDER = "/home/gorannik/veljko-diplomski/events"

HEARTBEAT_INTERVAL = 30
# ============================================================

def convert_h264_to_mp4(h264_path, delete_original=True):
    """
    Convert raw H.264 file to MP4 container using ffmpeg.
    Runs in a background thread so it doesn't block the API response.
    """
    try:
        mp4_path = h264_path.replace('.h264', '.mp4')

        print(f"🔄 Converting: {os.path.basename(h264_path)} → {os.path.basename(mp4_path)}")

        result = subprocess.run(
            [
                'ffmpeg',
                '-framerate', '30',
                '-i', h264_path,
                '-c', 'copy',
                '-movflags', '+faststart',
                '-y',
                mp4_path
            ],
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.returncode == 0 and os.path.exists(mp4_path) and os.path.getsize(mp4_path) > 0:
            print(f"✅ Conversion successful: {os.path.basename(mp4_path)}")
            
            if delete_original and os.path.exists(h264_path):
                os.remove(h264_path)
                print(f"🗑️ Deleted original: {os.path.basename(h264_path)}")
            
            return mp4_path
        else:
            print(f"❌ Conversion failed: {result.stderr.strip()}")
            return None

    except subprocess.TimeoutExpired:
        print(f"❌ Conversion timed out: {h264_path}")
        return None
    except Exception as e:
        print(f"❌ Conversion error: {e}")
        return None


def convert_in_background(h264_path, delete_original=True):
    """Run conversion in background thread"""
    thread = threading.Thread(
        target=convert_h264_to_mp4,
        args=(h264_path, delete_original),
        daemon=True
    )
    thread.start()
    print(f"[BACKGROUND] Started conversion for: {os.path.basename(h264_path)}")





class StreamingOutput(io.BufferedIOBase):
    """Buffer for MJPEG stream"""
    
    def __init__(self):
        self.frame = None
        self.condition = threading.Condition()
    
    def write(self, buf):
        with self.condition:
            self.frame = buf
            self.condition.notify_all()
        return len(buf)
    
    def get_frame(self):
        with self.condition:
            return self.frame
            
            
class MotionDetector:
    """Motion detection running in a background thread"""
    
    def __init__(self, camera_system):
        self.camera_system = camera_system
        self.config = {
            'enabled': False,
            'sensitivity': 20,
            'min_area': 500,
            'cooldown': 10,
            'auto_record': True
        }
        self.state = {
            'detecting': False,
            'last_trigger_time': 0,
            'previous_frame': None
        }
        self._thread = None
        
    def start(self):
        if self.state['detecting']: 
            return False, "Already detecting"
            
        self.config['enabled'] = True
        self.state['detecting'] = True
        self.state['previous_frame'] = None
        
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("🔍 Motion detection started")
        return True, "Motion detection started"

    def stop(self):
        self.state['detecting'] = False
        self.config['enabled'] = False
        print("🔍 Motion detection stopped")
        return True, "Motion detection stopped"

    def _loop(self):
        while self.state['detecting']:
            try:
                # 1. Get the latest JPEG frame from the existing stream
                frame_bytes = self.camera_system.get_frame()
                if not frame_bytes:
                    time.sleep(0.5)
                    continue

                # 2. Convert JPEG bytes to Grayscale numpy array
                img = Image.open(io.BytesIO(frame_bytes)).convert('L').resize((320, 240))
                # Use int16 to prevent overflow when subtracting
                current_frame = np.array(img, dtype=np.int16) 

                if self.state['previous_frame'] is None:
                    self.state['previous_frame'] = current_frame
                    time.sleep(0.5)
                    continue

                # 3. Calculate difference
                diff = np.abs(current_frame - self.state['previous_frame'])
                
                # Apply sensitivity threshold
                threshold = (100 - self.config['sensitivity']) * 2.55
                changed_pixels = np.sum(diff > threshold)

                # 4. Check if motion detected
                if changed_pixels > self.config['min_area']:
                    now = time.time()
                    
                    if now - self.state['last_trigger_time'] > self.config['cooldown']:
                        print(f"🚨 MOTION DETECTED! Changed pixels: {changed_pixels}")
                        self._handle_motion(frame_bytes, changed_pixels)
                        self.state['last_trigger_time'] = now

                # 5. Update previous frame
                self.state['previous_frame'] = current_frame
                time.sleep(0.5) # Check twice a second to save CPU

            except Exception as e:
                print(f"❌ Motion detection error: {e}")
                time.sleep(1)

    def _handle_motion(self, frame_bytes, confidence):
        timestamp = datetime.now()
        
        # 1. Save motion snapshot to EVENTS_FOLDER
        filename = f"motion_{timestamp.strftime('%Y%m%d_%H%M%S')}.jpg"
        filepath = os.path.join(EVENTS_FOLDER, filename)
        
        with open(filepath, 'wb') as f:
            f.write(frame_bytes)
        print(f"📸 Saved motion snapshot: {filename}")
            
        # 2. Auto-start recording
        if self.config.get('auto_record', True) and not self.camera_system.is_recording:
            print("📹 Auto-starting recording due to motion")
            self.camera_system.start_recording()
            
            # Auto-stop after 30 seconds
            threading.Timer(30.0, self._auto_stop_recording).start()
            
    def _auto_stop_recording(self):
        if self.camera_system.is_recording:
            print("⏹ Auto-stopping motion recording (30s elapsed)")
            self.camera_system.stop_recording()

class CameraSystem:
    """Camera management"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.camera = None
        self.streaming_output = None
        self.jpeg_encoder = None
        
        self.is_recording = False
        self.h264_encoder = None
        self.h264_output = None
        self.current_video_path = None
        self.recording_start_time = None
        
        self._lock = threading.Lock()
        self._initialized = True
        
        self.motion_detector = MotionDetector(self)
        
        self._lock = threading.Lock()
        self._initialized = True
    
    def initialize(self):
        """Initialize camera"""
        print("[CAMERA] Initializing...")
        
        os.makedirs(SAVE_FOLDER, exist_ok=True)
        os.makedirs(EVENTS_FOLDER, exist_ok=True)
        
        self.camera = Picamera2()
        
        config = self.camera.create_video_configuration(
            main={"size": RESOLUTION, "format": "RGB888"},
            lores={"size": (640, 480), "format": "YUV420"},
            encode="lores"
        )
        self.camera.configure(config)
        
        self.streaming_output = StreamingOutput()
        
        self.jpeg_encoder = JpegEncoder(q=JPEG_QUALITY)
        self.h264_encoder = H264Encoder(bitrate=VIDEO_BITRATE)
        
        self.camera.start()
        time.sleep(1)
        
        self.camera.start_encoder(
            self.jpeg_encoder,
            FileOutput(self.streaming_output),
            name="lores"
        )
        
        print("[CAMERA] ✓ Streaming active!")
    
    def close(self):
        """Close camera"""
        with self._lock:
            if self.is_recording:
                self._stop_recording_internal()
            
            if self.camera:
                try:
                    self.camera.stop_encoder(self.jpeg_encoder)
                except:
                    pass
                try:
                    self.camera.stop()
                    self.camera.close()
                except:
                    pass
                self.camera = None
        
        print("[CAMERA] Closed.")
    
    def get_frame(self):
        """Get current frame"""
        if self.streaming_output:
            return self.streaming_output.get_frame()
        return None
    
    def wait_for_frame(self, timeout=5.0):
        """Wait for new frame"""
        if self.streaming_output:
            with self.streaming_output.condition:
                self.streaming_output.condition.wait(timeout=timeout)
                return self.streaming_output.frame
        return None
    
    def take_snapshot(self):
        """Take a snapshot"""
        with self._lock:
            if not self.camera:
                return None, "Camera not initialized"
            
            try:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"snapshot_{timestamp}.jpg"
                filepath = os.path.join(SAVE_FOLDER, filename)
                
                self.camera.capture_file(filepath)
                
                with open(filepath, 'rb') as f:
                    frame = f.read()
                
                print(f"[CAMERA] 📷 Snapshot: {filename}")
                return frame, filename
                    
            except Exception as e:
                print(f"[CAMERA] Snapshot error: {e}")
                return None, str(e)
    
    def start_recording(self):
        """Start recording"""
        with self._lock:
            if not self.camera:
                return False, "Camera not initialized"
            
            if self.is_recording:
                return False, "Recording already in progress"
            
            try:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"video_{timestamp}.h264"
                self.current_video_path = os.path.join(SAVE_FOLDER, filename)
                
                self.h264_output = FileOutput(self.current_video_path)
                
                self.camera.start_encoder(
                    self.h264_encoder,
                    self.h264_output,
                    name="main"
                )
                
                self.is_recording = True
                self.recording_start_time = datetime.now()
                
                print(f"[CAMERA] 🔴 Recording: {filename}")
                return True, filename
                
            except Exception as e:
                print(f"[CAMERA] Recording start error: {e}")
                self.is_recording = False
                self.current_video_path = None
                return False, str(e)
    
    def stop_recording(self):
        """Stop recording"""
        with self._lock:
            return self._stop_recording_internal()
    
    def _stop_recording_internal(self):
        """Internal stop method"""
        if not self.is_recording:
            return False, "Not recording"
        
        try:
            self.camera.stop_encoder(self.h264_encoder)
            
            filepath = self.current_video_path
            filename = os.path.basename(filepath)
            filesize = os.path.getsize(filepath) if os.path.exists(filepath) else 0
            
            duration = 0
            if self.recording_start_time:
                duration = (datetime.now() - self.recording_start_time).total_seconds()
            
            self.is_recording = False
            self.current_video_path = None
            self.h264_output = None
            self.recording_start_time = None
            
            print(f"[CAMERA] ⏹ Recording stopped: {filename} ({filesize} bytes, {duration:.1f}s)")
            
            convert_in_background(filepath)
            
            return True, {"filename": filename, "size": filesize, "duration": duration}
            
        except Exception as e:
            print(f"[CAMERA] Recording stop error: {e}")
            self.is_recording = False
            return False, str(e)
    
    def get_status(self):
        """Get camera status"""
        recording_duration = 0
        if self.is_recording and self.recording_start_time:
            recording_duration = (datetime.now() - self.recording_start_time).total_seconds()
        
        return {
            "initialized": self.camera is not None,
            "streaming": self.jpeg_encoder is not None,
            "recording": self.is_recording,
            "recording_duration": round(recording_duration, 1),
            "current_video": os.path.basename(self.current_video_path) if self.current_video_path else None,
            "resolution": f"{RESOLUTION[0]}x{RESOLUTION[1]}"
        }


class WebHandler(BaseHTTPRequestHandler):
    """HTTP request handler"""
    
    camera_system = None
    
    def do_GET(self):
        if self.path == '/':
            self._serve_index()
        elif self.path == '/stream.mjpg':
            self._serve_stream()
        elif self.path.startswith('/snapshot'):
            self._serve_snapshot()
        elif self.path == '/api/status':
            self._serve_api_status()
        elif self.path == '/api/files':
            self._serve_api_files()
        elif self.path == '/api/files/list':
            self._serve_files_list()
        elif self.path == '/api/files/snapshots':  
            self._serve_files_snapshots()
        elif self.path == '/api/files/videos':     
            self._serve_files_videos()    
        elif self.path.startswith('/api/files/snapshot/'):  
            self._serve_single_snapshot()
        elif self.path.startswith('/api/files/video/'):     
            self._serve_single_video()    
        elif self.path == '/api/motion/config':   
            self._serve_motion_config()    
        elif self.path.startswith('/api/download/'):
            self._serve_file_download()
        elif self.path == '/favicon.ico':
            self._serve_empty()
        else:
            self._serve_404()
    
    def do_POST(self):
        if self.path == '/api/snapshot':
            self._api_snapshot()
        elif self.path == '/api/record/start':
            self._api_record_start()
        elif self.path == '/api/record/stop':
            self._api_record_stop()
        elif self.path == '/api/motion/start':     
            self._api_start_motion()
        elif self.path == '/api/motion/stop':      
            self._api_stop_motion()
        elif self.path == '/api/motion/config':    
            self._api_update_motion_config()
        else:
            self._serve_404()
    
    def do_DELETE(self):
        """Handle DELETE requests"""
        if self.path.startswith('/api/files/delete/'):
            self._api_delete_file()
        elif self.path.startswith('/api/files/snapshot/'):  
            self._api_delete_snapshot()
        elif self.path.startswith('/api/files/video/'):     
            self._api_delete_video()
        else:
            self._serve_404()
    
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def _serve_index(self):
        """Main page"""
        html = """<!DOCTYPE html>
<html>
<head>
    <title>Veljko Camera System</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: white;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #4CAF50; text-align: center; }
        .stream-container {
            text-align: center;
            margin-bottom: 20px;
            position: relative;
        }
        .stream-container img {
            max-width: 100%;
            border: 3px solid #4CAF50;
            border-radius: 10px;
        }
        .rec-indicator {
            position: absolute;
            top: 10px;
            right: 10px;
            background: #f44336;
            padding: 8px 15px;
            border-radius: 20px;
            font-weight: bold;
            display: none;
        }
        .rec-indicator.active { display: block; animation: blink 1s infinite; }
        @keyframes blink { 50% { opacity: 0.5; } }
        
        .controls {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 20px;
        }
        button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover { background: #45a049; }
        button.recording { background: #f44336; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📹 Veljko Camera System</h1>
        
        <div class="stream-container">
            <div class="rec-indicator" id="recIndicator">🔴 REC</div>
            <img src="/stream.mjpg" alt="Live Stream">
        </div>
        
        <div class="controls">
            <button onclick="takeSnapshot()">📷 Snapshot</button>
            <button onclick="toggleRecording()" id="recordBtn">🔴 Record</button>
            <button onclick="refreshStatus()">🔄 Refresh</button>
        </div>
    </div>
    
    <script>
        let isRecording = false;
        
        async function takeSnapshot() {
            const res = await fetch('/api/snapshot', { method: 'POST' });
            const data = await res.json();
            alert(data.success ? '✅ Saved: ' + data.filename : '❌ ' + data.error);
        }
        
        async function toggleRecording() {
            const endpoint = isRecording ? '/api/record/stop' : '/api/record/start';
            const res = await fetch(endpoint, { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                isRecording = !isRecording;
                updateUI();
            }
        }
        
        function updateUI() {
            document.getElementById('recordBtn').className = isRecording ? 'recording' : '';
            document.getElementById('recordBtn').textContent = isRecording ? '⏹ Stop' : '🔴 Record';
            document.getElementById('recIndicator').className = 'rec-indicator' + (isRecording ? ' active' : '');
        }
        
        async function refreshStatus() {
            const res = await fetch('/api/status');
            const data = await res.json();
            isRecording = data.recording;
            updateUI();
        }
        
        refreshStatus();
        setInterval(refreshStatus, 3000);
    </script>
</body>
</html>"""
        
        content = html.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', len(content))
        self.end_headers()
        self.wfile.write(content)
    
    def _serve_stream(self):
        """MJPEG stream"""
        self.send_response(200)
        self.send_header('Age', '0')
        self.send_header('Cache-Control', 'no-cache, private')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=FRAME')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        try:
            while True:
                frame = WebHandler.camera_system.wait_for_frame()
                if frame:
                    self.wfile.write(b'--FRAME\r\n')
                    self.wfile.write(b'Content-Type: image/jpeg\r\n')
                    self.wfile.write(f'Content-Length: {len(frame)}\r\n'.encode())
                    self.wfile.write(b'\r\n')
                    self.wfile.write(frame)
                    self.wfile.write(b'\r\n')
        except:
            pass
    
    def _serve_snapshot(self):
        """Current frame"""
        frame = WebHandler.camera_system.get_frame()
        
        if frame:
            self.send_response(200)
            self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Content-Length', len(frame))
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(frame)
        else:
            self.send_response(503)
            self.end_headers()
    
    def _serve_api_status(self):
        """API: Status"""
        status = WebHandler.camera_system.get_status()
        self._send_json(status)
    
    def _serve_api_files(self):
        """API: File list (legacy)"""
        files = []
        
        if os.path.exists(SAVE_FOLDER):
            for filename in sorted(os.listdir(SAVE_FOLDER), reverse=True)[:50]:
                filepath = os.path.join(SAVE_FOLDER, filename)
                
                if os.path.isfile(filepath):
                    try:
                        size = os.path.getsize(filepath)
                        file_type = 'unknown'
                        
                        if filename.endswith(('.jpg', '.jpeg', '.png')):
                            file_type = 'image'
                        elif filename.endswith(('.mp4', '.h264')):
                            file_type = 'video'
                        
                        files.append({
                            "name": filename,
                            "size": size,
                            "size_str": self._format_size(size),
                            "type": file_type
                        })
                    except OSError:
                        continue
        
        self._send_json({"files": files})
    
    def _serve_files_list(self):
        """API: Detailed file list"""
        files = []
        
        if os.path.exists(SAVE_FOLDER):
            for filename in os.listdir(SAVE_FOLDER):
                filepath = os.path.join(SAVE_FOLDER, filename)
                
                if os.path.isfile(filepath):
                    try:
                        stat = os.stat(filepath)
                        
                        file_type = 'unknown'
                        if filename.endswith(('.jpg', '.jpeg', '.png')):
                            file_type = 'image'
                        elif filename.endswith(('.mp4', '.h264')):
                            file_type = 'video'
                        
                        files.append({
                            'name': filename,
                            'size': stat.st_size,
                            'size_str': self._format_size(stat.st_size),
                            'created': stat.st_mtime,
                            'type': file_type,
                        })
                    except OSError:
                        continue
        
        # Sort newest first
        files.sort(key=lambda f: f['created'], reverse=True)
        
        self._send_json({
            'success': True,
            'files': files,
            'count': len(files),
        })
        
    def _serve_files_snapshots(self):
        """API: List only snapshot files"""
        files = []
    
        if os.path.exists(SAVE_FOLDER):
            for filename in os.listdir(SAVE_FOLDER):
                # Only include image files
                if filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                    filepath = os.path.join(SAVE_FOLDER, filename)
                    
                    if os.path.isfile(filepath):
                        try:
                            stat = os.stat(filepath)
                            files.append({
                                'filename': filename,
                                'size': stat.st_size,
                                'created': stat.st_mtime,
                            })
                        except OSError:
                            continue
    
        # Sort newest first
        files.sort(key=lambda f: f['created'], reverse=True)
        
        self._send_json({
            'success': True,
            'files': files,
            'count': len(files),
        })

    def _serve_files_videos(self):
        """API: List only video files"""
        files = []
        
        if os.path.exists(SAVE_FOLDER):
            for filename in os.listdir(SAVE_FOLDER):
                # Only include video files
                if filename.lower().endswith(('.mp4', '.h264', '.avi', '.mkv')):
                    filepath = os.path.join(SAVE_FOLDER, filename)
                    
                    if os.path.isfile(filepath):
                        try:
                            stat = os.stat(filepath)
                            files.append({
                                'filename': filename,
                                'path': filename,  # For compatibility
                                'size': stat.st_size,
                                'created': stat.st_mtime,
                            })
                        except OSError:
                            continue
        
        # Sort newest first
        files.sort(key=lambda f: f['created'], reverse=True)
        
        self._send_json({
            'success': True,
            'files': files,
            'count': len(files),
        })    
    
    def _serve_file_download(self):
        """API: Download file"""
        filename = self.path.split('/api/download/')[-1]
        filename = os.path.basename(filename)
        filepath = os.path.join(SAVE_FOLDER, filename)
        
        if not os.path.exists(filepath):
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'File not found'}).encode())
            return
        
        try:
            # Determine content type
            content_type = 'application/octet-stream'
            if filename.endswith(('.jpg', '.jpeg')):
                content_type = 'image/jpeg'
            elif filename.endswith('.png'):
                content_type = 'image/png'
            elif filename.endswith('.mp4'):
                content_type = 'video/mp4'
            elif filename.endswith('.h264'):
                content_type = 'video/h264'
            
            with open(filepath, 'rb') as f:
                file_data = f.read()
            
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', len(file_data))
            self.send_header('Content-Disposition', f'inline; filename="{filename}"')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(file_data)
            
            print(f"[HTTP] Downloaded: {filename} ({len(file_data)} bytes)")
            
        except Exception as e:
            print(f"[HTTP] Download error: {e}")
            self.send_response(500)
            self.end_headers()
    
    def _api_snapshot(self):
        """API: Take snapshot"""
        print("[API] Snapshot request")
        frame, result = WebHandler.camera_system.take_snapshot()
        if frame:
            self._send_json({"success": True, "filename": result})
        else:
            self._send_json({"success": False, "error": result})
    
    def _api_record_start(self):
        """API: Start recording"""
        print("[API] Record START")
        success, result = WebHandler.camera_system.start_recording()
        if success:
            self._send_json({"success": True, "filename": result})
        else:
            self._send_json({"success": False, "error": result})
    
    def _api_record_stop(self):
        """API: Stop recording"""
        print("[API] Record STOP")
        success, result = WebHandler.camera_system.stop_recording()
        if success:
            self._send_json({"success": True, "data": result})
        else:
            self._send_json({"success": False, "error": result})
    
    def _api_delete_file(self):
        """API: Delete file"""
        filename = self.path.split('/api/files/delete/')[-1]
        filename = os.path.basename(filename)
        filepath = os.path.join(SAVE_FOLDER, filename)
        
        if not os.path.exists(filepath):
            self._send_json({'success': False, 'error': 'File not found'})
            return
        
        try:
            os.remove(filepath)
            print(f"[API] Deleted: {filename}")
            self._send_json({'success': True, 'filename': filename})
        except OSError as e:
            print(f"[API] Delete error: {e}")
            self._send_json({'success': False, 'error': str(e)})
            
            
            
    def _api_delete_snapshot(self):
        """API: Delete snapshot file"""
        # Extract filename from path like /api/files/snapshot/snapshot_123.jpg
        filename = self.path.split('/api/files/snapshot/')[-1]
        filename = os.path.basename(filename)  # Security: prevent directory traversal
        filepath = os.path.join(SAVE_FOLDER, filename)
        
        if not os.path.exists(filepath):
            self._send_json({'success': False, 'error': 'File not found'})
            return
        
        # Verify it's actually an image file
        if not filename.lower().endswith(('.jpg', '.jpeg', '.png')):
            self._send_json({'success': False, 'error': 'Not a valid snapshot file'})
            return
        
        try:
            os.remove(filepath)
            print(f"[API] Deleted snapshot: {filename}")
            self._send_json({'success': True, 'filename': filename})
        except OSError as e:
            print(f"[API] Delete error: {e}")
            self._send_json({'success': False, 'error': str(e)})

    def _api_delete_video(self):
        """API: Delete video file"""
        # Extract filename from path like /api/files/video/video_123.h264
        filename = self.path.split('/api/files/video/')[-1]
        filename = os.path.basename(filename)  # Security: prevent directory traversal
        filepath = os.path.join(SAVE_FOLDER, filename)
        
        if not os.path.exists(filepath):
            self._send_json({'success': False, 'error': 'File not found'})
            return
        
        # Verify it's actually a video file
        if not filename.lower().endswith(('.mp4', '.h264', '.avi', '.mkv')):
            self._send_json({'success': False, 'error': 'Not a valid video file'})
            return
        
        try:
            os.remove(filepath)
            print(f"[API] Deleted video: {filename}")
            self._send_json({'success': True, 'filename': filename})
        except OSError as e:
            print(f"[API] Delete error: {e}")
            self._send_json({'success': False, 'error': str(e)})  
            
      
    def _serve_single_snapshot(self):
        """API: Serviranje pojedinačnog snapshot fajla"""
        # Izvuci filename iz path-a: /api/files/snapshot/snapshot_123.jpg
        filename = self.path.split('/api/files/snapshot/')[-1]
        filename = os.path.basename(filename)  # Bezbednost
        filepath = os.path.join(SAVE_FOLDER, filename)
    
        if not os.path.exists(filepath):
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'File not found'}).encode())
            return
        
        try:
            with open(filepath, 'rb') as f:
                file_data = f.read()
            
            self.send_response(200)
            self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Content-Length', len(file_data))
            self.send_header('Content-Disposition', f'inline; filename="{filename}"')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(file_data)
            
            print(f"[HTTP] Served snapshot: {filename}")
            
        except Exception as e:
            print(f"[HTTP] Error serving snapshot: {e}")
            self.send_response(500)
            self.end_headers()

    def _serve_single_video(self):
        """API: Serviranje pojedinačnog video fajla"""
        # Izvuci filename iz path-a: /api/files/video/video_123.h264
        filename = self.path.split('/api/files/video/')[-1]
        filename = os.path.basename(filename)  # Bezbednost
        filepath = os.path.join(SAVE_FOLDER, filename)
        
        if not os.path.exists(filepath):
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'File not found'}).encode())
            return
        
        try:
            # Odredi content type
            if filename.endswith('.mp4'):
                content_type = 'video/mp4'
            elif filename.endswith('.h264'):
                content_type = 'video/h264'
            else:
                content_type = 'application/octet-stream'
            
            with open(filepath, 'rb') as f:
                file_data = f.read()
            
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', len(file_data))
            self.send_header('Content-Disposition', f'inline; filename="{filename}"')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(file_data)
            
            print(f"[HTTP] Served video: {filename}")
            
        except Exception as e:
            print(f"[HTTP] Error serving video: {e}")
            self.send_response(500)
            self.end_headers() 
            
    def _serve_motion_config(self):
        """API: Get motion config"""
        md = WebHandler.camera_system.motion_detector
        self._send_json({
            'success': True,
            'config': md.config,
            'state': {
                'detecting': md.state['detecting'],
                'last_trigger': md.state['last_trigger_time']
            }
        })

    def _api_start_motion(self):
        """API: Start motion detection"""
        success, msg = WebHandler.camera_system.motion_detector.start()
        self._send_json({'success': success, 'message': msg})

    def _api_stop_motion(self):
        """API: Stop motion detection"""
        success, msg = WebHandler.camera_system.motion_detector.stop()
        self._send_json({'success': success, 'message': msg})

    def _api_update_motion_config(self):
        """API: Update motion settings"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            md = WebHandler.camera_system.motion_detector
            
            if 'enabled' in data:
                if data['enabled'] and not md.state['detecting']:
                    md.start()
                elif not data['enabled'] and md.state['detecting']:
                    md.stop()
                    
            if 'sensitivity' in data:
                md.config['sensitivity'] = max(0, min(100, int(data['sensitivity'])))
            if 'min_area' in data:
                md.config['min_area'] = max(100, int(data['min_area']))
            if 'cooldown' in data:
                md.config['cooldown'] = max(1, int(data['cooldown']))
            if 'auto_record' in data:
                md.config['auto_record'] = bool(data['auto_record'])
                
            self._send_json({'success': True, 'config': md.config})
        except Exception as e:
            self._send_json({'success': False, 'error': str(e)})                     
    
    def _send_json(self, data):
        """Send JSON response"""
        try:
            content = json.dumps(data).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(content))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(content)
            self.wfile.flush()
        except BrokenPipeError:
            pass
        except Exception as e:
            print(f"[HTTP] Send error: {e}")
    
    def _serve_empty(self):
        self.send_response(204)
        self.end_headers()
    
    def _serve_404(self):
        self.send_response(404)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'Not Found')
    
    def _format_size(self, size):
        """Format file size"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"
    
    def log_message(self, format, *args):
        try:
            msg = format % args
            if '/stream.mjpg' not in msg and '/favicon' not in msg and '/api/status' not in msg:
                print(f"[HTTP] {msg}")
        except:
            pass


class MQTTHandler:
    """MQTT communication"""
    
    def __init__(self, camera_system):
        self.camera = camera_system
        self.client = mqtt.Client(client_id=MQTT_CLIENT_ID)
        self.running = False
        
        self.TOPIC_COMMAND = "camera/command"
        self.TOPIC_STATUS = "camera/status"
        self.TOPIC_SNAPSHOT = "camera/snapshot"
        self.TOPIC_RESPONSE = "camera/response"
        self.TOPIC_HEARTBEAT = "camera/heartbeat"
    
    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print("[MQTT] Connected!")
            client.subscribe(self.TOPIC_COMMAND)
            self.publish_status()
        else:
            print(f"[MQTT] Error: {rc}")
    
    def on_message(self, client, userdata, msg):
        payload = msg.payload.decode('utf-8').strip().lower()
        print(f"[MQTT] Command: {payload}")
        
        if payload == "snapshot":
            self.cmd_snapshot()
        elif payload == "record_start":
            self.cmd_record_start()
        elif payload == "record_stop":
            self.cmd_record_stop()
        elif payload == "status":
            self.cmd_status()
        else:
            self.send_response("error", f"Unknown: {payload}")
    
    def cmd_snapshot(self):
        frame, result = self.camera.take_snapshot()
        if frame:
            payload = {
                "timestamp": datetime.now().isoformat(),
                "filename": result,
                "size": len(frame),
                "image": base64.b64encode(frame).decode('utf-8')
            }
            self.client.publish(self.TOPIC_SNAPSHOT, json.dumps(payload))
            self.send_response("success", f"Snapshot: {result}")
        else:
            self.send_response("error", result)
    
    def cmd_record_start(self):
        success, result = self.camera.start_recording()
        if success:
            self.send_response("success", f"Recording: {result}")
            self.publish_status()
        else:
            self.send_response("error", result)
    
    def cmd_record_stop(self):
        success, result = self.camera.stop_recording()
        if success:
            self.send_response("success", "Recording stopped", result)
            self.publish_status()
        else:
            self.send_response("error", result)
    
    def cmd_status(self):
        self.publish_status()
    
    def send_response(self, status, message, data=None):
        response = {
            "timestamp": datetime.now().isoformat(),
            "status": status,
            "message": message
        }
        if data:
            response["data"] = data
        self.client.publish(self.TOPIC_RESPONSE, json.dumps(response))
    
    def publish_status(self):
        status = self.camera.get_status()
        status["timestamp"] = datetime.now().isoformat()
        status["online"] = True
        self.client.publish(self.TOPIC_STATUS, json.dumps(status), retain=True)
    
    def heartbeat_loop(self):
        counter = 0
        while self.running:
            time.sleep(HEARTBEAT_INTERVAL)
            if not self.running:
                break
            counter += 1
            payload = {
                "timestamp": datetime.now().isoformat(),
                "counter": counter,
                "recording": self.camera.is_recording
            }
            self.client.publish(self.TOPIC_HEARTBEAT, json.dumps(payload))
    
    def start(self):
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        
        will = json.dumps({"online": False, "timestamp": datetime.now().isoformat()})
        self.client.will_set(self.TOPIC_STATUS, will, qos=1, retain=True)
        
        self.client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        self.running = True
        
        threading.Thread(target=self.heartbeat_loop, daemon=True).start()
        self.client.loop_start()
    
    def stop(self):
        self.running = False
        offline = json.dumps({"online": False, "timestamp": datetime.now().isoformat()})
        self.client.publish(self.TOPIC_STATUS, offline, retain=True)
        self.client.loop_stop()
        self.client.disconnect()


def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "localhost"


def main():
    print("=" * 60)
    print("  VELJKO CAMERA SYSTEM")
    print("=" * 60)
    
    ip = get_ip()
    
    camera_system = None
    mqtt_handler = None
    http_server = None
    
    try:
        # Camera
        camera_system = CameraSystem()
        camera_system.initialize()
        
        WebHandler.camera_system = camera_system
        
        # MQTT
        print("\n[MQTT] Connecting...")
        mqtt_handler = MQTTHandler(camera_system)
        mqtt_handler.start()
        
        # HTTP
        print(f"[HTTP] Starting on port {HTTP_PORT}...")
        http_server = HTTPServer(('0.0.0.0', HTTP_PORT), WebHandler)
        
        print("\n" + "=" * 60)
        print("  ✅ SISTEM AKTIVAN!")
        print("=" * 60)
        print(f"\n  📺 Web UI:      http://{ip}:{HTTP_PORT}")
        print(f"  🎬 Stream:      http://{ip}:{HTTP_PORT}/stream.mjpg")
        print(f"  📷 Snapshot:    http://{ip}:{HTTP_PORT}/snapshot.jpg")
        print(f"\n  MQTT Komande:")
        print(f"    mosquitto_pub -t 'camera/command' -m 'snapshot'")
        print(f"    mosquitto_pub -t 'camera/command' -m 'record_start'")
        print(f"    mosquitto_pub -t 'camera/command' -m 'record_stop'")
        print(f"    mosquitto_pub -t 'camera/command' -m 'status'")
        print(f"\n  Ctrl+C za izlaz")
        print("=" * 60 + "\n")
        
        http_server.serve_forever()
        
    except KeyboardInterrupt:
        print("\n\n[INFO] Shutting down...")
        
    finally:
        if http_server:
            http_server.shutdown()
        if mqtt_handler:
            mqtt_handler.stop()
        if camera_system:
            camera_system.close()
        
        print("[OK] System stopped.")


        


if __name__ == "__main__":
    main()
