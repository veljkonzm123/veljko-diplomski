#!/usr/bin/env python3

import paho.mqtt.client as mqtt
from picamera2 import Picamera2
from picamera2.encoders import JpegEncoder, H264Encoder
from picamera2.outputs import FileOutput
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from PIL import Image
from socketserver import ThreadingMixIn
import io
import os
import json
import threading
import time
import socket
import subprocess 
import urllib.request
import shutil



from motion_detection import MotionDetector

# ============================================================
# SETTINGS
# ============================================================
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_CLIENT_ID = "veljko-camera-main"

HTTP_PORT = 8080

RESOLUTION = (1280, 720)
JPEG_QUALITY = 30
VIDEO_BITRATE = 8000000

SAVE_FOLDER = "/home/gorannik/veljko-diplomski/recordings"
EVENTS_FOLDER = "/home/gorannik/veljko-diplomski/events"

HEARTBEAT_INTERVAL = 30


PUSH_TOKEN_FILE = "/home/gorannik/veljko-diplomski/push_token.json"
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# ============================================================
# - File Organization
# ============================================================

def get_stream_resolution(main_resolution: tuple) -> tuple:
    """
    Calculate the appropriate stream (lores) resolution
    based on the main recording resolution.
    Keeps the same aspect ratio but at a lower resolution for smooth streaming.
    """
    STREAM_RESOLUTION_MAP = {
        (854,  480):  (640, 360),   # 480p  → stream at 360p
        (1280, 720):  (640, 360),   # 720p  → stream at 360p
        (1920, 1080): (960, 540),   # 1080p → stream at 540p
    }
    # Return the mapped resolution, or a safe default if not found
    return STREAM_RESOLUTION_MAP.get(main_resolution, (640, 360))

def get_organized_path(base_folder, filename):
    
    try:
        # Extract date from filename like: snapshot_20241215_143022.jpg
        parts = filename.split('_')
        date_str = parts[1]  # '20241215'
        date = datetime.strptime(date_str, "%Y%m%d")
    except (IndexError, ValueError):
        date = datetime.now()

    month_folder = date.strftime("%Y-%m")   # e.g. "2024-12"
    day_folder   = date.strftime("%d")      # e.g. "15"

    folder_path = os.path.join(base_folder, month_folder, day_folder)
    os.makedirs(folder_path, exist_ok=True)

    return os.path.join(folder_path, filename)

def list_gallery_files(base_folder, extensions):
    """
    Walk base_folder recursively and return a list of file dicts,
    sorted newest first, with a 'date_path' field for display.
    
    extensions: tuple of lowercase extensions e.g. ('.jpg', '.jpeg', '.png')
    """
    files = []

    if not os.path.exists(base_folder):
        return files

    for root, dirs, filenames in os.walk(base_folder):
        # dirs sorted so we walk in predictable order
        dirs.sort()
        for filename in filenames:
            if filename.lower().endswith(extensions):
                filepath = os.path.join(root, filename)
                try:
                    stat = os.stat(filepath)
                    # Build a human-readable relative path: "2024-12/15"
                    rel = os.path.relpath(root, base_folder)
                    date_path = rel if rel != '.' else ''

                    files.append({
                        'filename': filename,
                        'size':     stat.st_size,
                        'created':  stat.st_mtime,
                        'date_path': date_path,   # e.g. "2024-12/15"
                    })
                except OSError:
                    continue

    files.sort(key=lambda f: f['created'], reverse=True)
    return files
    
def find_file_in_gallery(base_folder, filename):
    """
    Search for a file anywhere inside base_folder (recursive).
    Returns full path if found, None otherwise.
    """
    for root, dirs, files in os.walk(base_folder):
        if filename in files:
            return os.path.join(root, filename)
    return None    
    
def _cleanup_empty_dirs(folder, stop_at):
    """
    Walk upward from `folder` removing empty directories,
    but never removing `stop_at` itself.
    """
    folder = os.path.abspath(folder)
    stop_at = os.path.abspath(stop_at)

    while folder != stop_at:
        try:
            if os.path.isdir(folder) and not os.listdir(folder):
                os.rmdir(folder)
                print(f"[GALLERY] Removed empty folder: {folder}")
            else:
                break   # not empty, stop walking up
        except OSError:
            break
        folder = os.path.dirname(folder)  


# ============================================================
# STORAGE MANAGER
# ============================================================

class StorageManager:
    """Manages disk space by deleting old files based on configured rules."""
    CONFIG_FILE = "storage_config.json"
    DEFAULT_CONFIG = {
        'auto_delete_enabled': False,
        'max_days': 14,
        'max_gb': 10,
        'check_interval_hours': 6.0, # How often to run the cleanup job 6
        'warning_threshold_pct': 85.0,
    }

    def __init__(self, folder_to_manage,camera_system):
        self.managed_folder = folder_to_manage
        self.config = self.DEFAULT_CONFIG.copy()
        self.camera_system = camera_system
        
        self._thread = None
        self._is_running = False
        self._lock = threading.RLock()

       # self._low_storage_warning_sent = False 
        

    def _load_config(self):
        """Load config from JSON file, or use defaults if file doesn't exist."""
        try:
            if os.path.exists(self.CONFIG_FILE):
                with open(self.CONFIG_FILE, 'r') as f:
                    saved = json.load(f)
                    config = self.DEFAULT_CONFIG.copy()
                    config.update(saved)
                    print(f"[STORAGE] Loaded saved config: {config}")
                    return config
        except Exception as e:
            print(f"[STORAGE] Could not load config file: {e}")
        return self.DEFAULT_CONFIG.copy()

    def _save_config(self):
        """Save current config to JSON file so it survives reboots."""
        try:
            with open(self.CONFIG_FILE, 'w') as f:
                json.dump(self.config, f, indent=4)
        except Exception as e:
            print(f"[STORAGE] Could not save config file: {e}")

    def update_config(self, **kwargs):
        """Update storage management configuration."""
        with self._lock:
            for key, value in kwargs.items():
                if key in self.config:
                    try:
                        target_type = type(self.config[key])
                        self.config[key] = target_type(value)
                        print(f"[STORAGE] Config updated: {key} = {self.config[key]}")
                    except (ValueError, TypeError):
                        print(f"[STORAGE] Warning: Could not set {key} to {value}")
            
            # 👇 FIX 3: Save to file immediately upon update
            self._save_config()

            if self.config['auto_delete_enabled'] and not self._is_running:
                self.start()
            elif not self.config['auto_delete_enabled'] and self._is_running:
                self.stop()
        return self.config

    def get_status(self):
        """Get current disk usage statistics."""
        try:
            total, used, free = shutil.disk_usage(self.managed_folder)
            return {
                'total_gb': round(total / (1024**3), 2),
                'used_gb': round(used / (1024**3), 2),
                'free_gb': round(free / (1024**3), 2),
                'used_pct': round((used / total) * 100, 1),
            }
        except FileNotFoundError:
            return { 'total_gb': 0, 'used_gb': 0, 'free_gb': 0, 'used_pct': 0 }

    def start(self):
        """Start the background cleanup thread."""
        with self._lock:
            if self._is_running:
                return
            self._is_running = True
            self._thread = threading.Thread(target=self._cleanup_loop, daemon=True)
            self._thread.start()
            print(f"[STORAGE] ▶️ Auto-cleanup manager started.")

    def stop(self):
        """Stop the background cleanup thread."""
        with self._lock:
            if not self._is_running:
                return
            self._is_running = False
            print("[STORAGE] ⏹️ Auto-cleanup manager stopped.")

    def _cleanup_loop(self):
        """The core loop that periodically runs the cleanup logic."""
        while self._is_running:
            try:
                print("[STORAGE] 🧹 Running scheduled cleanup...")

                # ─────────────────────────────────────────────────────────────
                # 1. CHECK STORAGE + SEND WARNING VIA MQTT (SVAKI PUT)
                # ─────────────────────────────────────────────────────────────
                try:
                    usage = self.get_status()
                    used_percentage = usage.get('used_pct', 0)
                    free_gb = usage.get('free_gb', 0)
                    
                    #WARNING_THRESHOLD_PCT = 85.0  # Threshold za upozorenje
                    WARNING_THRESHOLD_PCT = self.config.get('warning_threshold_pct', 85.0)
                    # 🔴 UVEK ŠALJI NOTIFIKACIJU ako je usage >= threshold
                    if used_percentage >= WARNING_THRESHOLD_PCT:
                        print(f"[STORAGE] ⚠️ Low storage warning! Usage: {used_percentage}%")
                        
                        if self.camera_system and self.camera_system.mqtt_handler:
                            payload = {
                                "timestamp": datetime.now().isoformat(),
                                "type": "storage_warning",
                                "used_pct": used_percentage,
                                "free_gb": free_gb
                            }
                            info = self.camera_system.mqtt_handler.client.publish(
                                "camera/storage",
                                json.dumps(payload),
                                qos=1,
                                retain=False
                            )
                            print(f"[MQTT] 📡 Published storage warning (rc={info.rc})")

                except Exception as e:
                    print(f"[STORAGE] ❌ Error during notification check: {e}")

                # ─────────────────────────────────────────────────────────────
                # 2. RUN CLEANUP (delete old files)
                # ─────────────────────────────────────────────────────────────
                self._run_cleanup_logic()

            except Exception as e:
                print(f"[STORAGE] ❌ Error during cleanup: {e}")

            # ─────────────────────────────────────────────────────────────
            # 3. WAIT LOOP (safe stop)
            # ─────────────────────────────────────────────────────────────
            wait_seconds = self.config['check_interval_hours'] * 3600

            for _ in range(int(wait_seconds)):
                if not self._is_running:
                    break
                time.sleep(1)

    def _run_cleanup_logic(self):
        """The main logic for finding and deleting files."""
        if not self.config['auto_delete_enabled']:
            return
    
        now = time.time()
        max_days_sec = self.config['max_days'] * 86400
        min_free_gb_bytes = self.config['max_gb'] * (1024**3)

        # --- Rule 1: Delete files older than max_days ---
        files_deleted_by_age = 0
        all_files = self._get_all_files_sorted()
        
        files_to_check = [] 
        for file_path, modified_time in all_files:
            age_seconds = now - modified_time
            if age_seconds > max_days_sec:
                try:
                    os.remove(file_path)
                    files_deleted_by_age += 1
                    print(f"[STORAGE] 🗑️ Deleted old file (age): {os.path.basename(file_path)}")
                except OSError as e:
                    print(f"[STORAGE] ❌ Failed to delete {file_path}: {e}")
            else:
                files_to_check.append((file_path, modified_time))

        if files_deleted_by_age > 0:
            print(f"[STORAGE] ✅ Cleanup (by age) finished. Deleted {files_deleted_by_age} files.")

        # --- Rule 2: Delete oldest files if FREE SPACE is below the threshold ---
        files_deleted_by_size = 0
        try:
            _, _, free_space = shutil.disk_usage(self.managed_folder)
            
            for file_path, _ in files_to_check:
                if free_space > min_free_gb_bytes:
                    break
                
                try:
                    file_size = os.path.getsize(file_path)
                    os.remove(file_path)
                    free_space += file_size 
                    files_deleted_by_size += 1
                    print(f"[STORAGE] 🗑️ Deleted old file (to free space): {os.path.basename(file_path)}")
                except OSError as e:
                    print(f"[STORAGE] ❌ Failed to delete {file_path}: {e}")

        except FileNotFoundError:
            print("[STORAGE] ❌ Could not check disk usage. Path not found.")

        if files_deleted_by_size > 0:
            print(f"[STORAGE] ✅ Cleanup (by size) finished. Deleted {files_deleted_by_size} files.")

    def _get_all_files_sorted(self):
        """Returns a list of all files in the managed folder, sorted from oldest to newest."""
        file_list = []
        for root, _, files in os.walk(self.managed_folder):
            for filename in files:
                if filename.lower().endswith(('.mp4', '.h264', '.jpg')):
                    file_path = os.path.join(root, filename)
                    try:
                        modified_time = os.path.getmtime(file_path)
                        file_list.append((file_path, modified_time))
                    except FileNotFoundError:
                        continue
        file_list.sort(key=lambda x: x[1])
        return file_list
        
# ============================================================
# PUSH NOTIFICATION MANAGER
# ============================================================


class PushNotificationManager:
    """Sends push notifications to the mobile app via Expo's service."""

    def __init__(self):
        self.token = self._load_token()

    def _load_token(self) -> str | None:
        """Load saved push token and preferences from disk."""
        try:
            if os.path.exists(PUSH_TOKEN_FILE):
                with open(PUSH_TOKEN_FILE, 'r') as f:
                    data = json.load(f)
                    self.preferences = data.get('preferences', {})
                    token = data.get('token')
                    if token:
                        print(f"[PUSH] Loaded token: {token[:20]}...")
                        return token
        except Exception as e:
            print(f"[PUSH] Could not load token: {e}")
        self.preferences = {}
        return None
        
    def send_motion_alert(self, confidence: float, snapshot_filename: str):
        """Send a motion alert only if the user has enabled it."""
        if not self.preferences.get('notifyMotion', True):
            print("[PUSH] Motion notifications disabled by user preference.")
            return

        self.send(
            title="🏃 Motion Detected!",
            body=f"Movement detected at {datetime.now().strftime('%H:%M:%S')}",
            data={
                "type": "motion_detected",
                "confidence": confidence,
                "snapshot": snapshot_filename,
                "timestamp": datetime.now().isoformat(),
            }
        ) 
        
    def send_storage_alert(self, used_pct: float, free_gb: float):
        """Sends a low storage alert ONLY IF the user has enabled it."""
        if not self.preferences.get('notifyStorage', True): # Подразумевано је True
            print("[PUSH] Skipping storage notification (disabled by user).")
            return

        self.send(
            title="⚠️ Low Storage Warning",
            body=f"Disk usage is at {used_pct}%. Only {free_gb:.1f} GB remaining.",
            data={ "type": "storage_alert", "used_pct": used_pct }
        )       

    def save_token(self, token: str, preferences: dict = None):
        """Save push token and preferences to disk."""
        try:
            with open(PUSH_TOKEN_FILE, 'w') as f:
                json.dump({
                    'token': token,
                    'updated': datetime.now().isoformat(),
                    # Store preferences, with safe defaults
                    'preferences': preferences or {
                        'notifyMotion': True,
                        'notifyRecording': False,
                        'notifyStorage': True,
                    }
                }, f)
            self.token = token
            self.preferences = preferences or {}
            print(f"[PUSH] ✅ Token + preferences saved.")
        except Exception as e:
            print(f"[PUSH] Could not save token: {e}")

    def send(self, title: str, body: str, data: dict = None):
        """
        Send a push notification to the registered device.
        This is a fire-and-forget operation run in a background thread.
        """
        if not self.token:
            print("[PUSH] No token registered, skipping notification.")
            return

        thread = threading.Thread(
            target=self._send_internal,
            args=(title, body, data or {}),
            daemon=True,
        )
        thread.start()

    def _send_internal(self, title: str, body: str, data: dict):
        """Internal method that actually makes the HTTP request to Expo."""
        try:
            payload = json.dumps({
                "to": self.token,
                "title": title,
                "body": body,
                "data": data,
                "sound": "default",
                "priority": "high",
                # Android specific
                "channelId": "camera-alerts",
                # Badge count
                "badge": 1,
            }).encode('utf-8')

            req = urllib.request.Request(
                EXPO_PUSH_URL,
                data=payload,
                headers={
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                },
                method='POST',
            )

            with urllib.request.urlopen(req, timeout=10) as response:
                result = json.loads(response.read().decode('utf-8'))

                # Check if Expo reported an error for this specific token
                if result.get('data', {}).get('status') == 'error':
                    error_msg = result.get('data', {}).get('message', 'Unknown error')
                    print(f"[PUSH] ❌ Expo error: {error_msg}")
                    # If the token is invalid, clear it
                    if 'DeviceNotRegistered' in error_msg:
                        print("[PUSH] Token is no longer valid, clearing.")
                        self.token = None
                else:
                    print(f"[PUSH] ✅ Notification sent: '{title}'")

        except Exception as e:
            print(f"[PUSH] ❌ Failed to send notification: {e}")          

push_manager=PushNotificationManager()
# ============================================================
# VIDEO CONVERSION
# ============================================================
def convert_h264_to_mp4(h264_path, delete_original=True):
    """Convert raw H.264 file to MP4 container using ffmpeg."""
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


# ============================================================
# STREAMING & CAMERA SYSTEM
# ============================================================
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
        
        self.current_resolution = RESOLUTION       # e.g. (1280, 720)
        self.current_bitrate = VIDEO_BITRATE
        
        self.is_247_recording_active = False
        self._247_thread = None
        
        # Initialize motion detector
        self.motion_detector = MotionDetector(self, events_folder=EVENTS_FOLDER)
        self.mqtt_handler = None
    
    def initialize(self):
        """Initialize camera"""
        print("[CAMERA] Initializing...")
        
        os.makedirs(SAVE_FOLDER, exist_ok=True)
        os.makedirs(EVENTS_FOLDER, exist_ok=True)
        
        self.camera = Picamera2()
        
        stream_res = get_stream_resolution(self.current_resolution)
        print(f"[CAMERA] Main: {self.current_resolution}, Stream: {stream_res}")

        config = self.camera.create_video_configuration(
            main={"size": self.current_resolution, "format": "RGB888"},
            lores={"size": stream_res, "format": "YUV420"},  # 👈 Use calculated resolution
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
                
                filepath = get_organized_path(SAVE_FOLDER, filename)
                
                self.camera.capture_file(filepath)
                
                with open(filepath, 'rb') as f:
                    frame = f.read()
                
                print(f"[CAMERA] 📷 Snapshot: {filename}")
                return frame, filename
                    
            except Exception as e:
                print(f"[CAMERA] Snapshot error: {e}")
                return None, str(e)
    
    def start_recording(self,trigger="manual"):
        """Start recording"""
        
        if trigger == "manual" and self.is_247_recording_active:
            return False, "Cannot start manual recording while 24/7 mode is active."
        
        with self._lock:
            if not self.camera:
                return False, "Camera not initialized"
            
            if self.is_recording:
                return False, "Recording already in progress"
                
                
            
            try:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                prefix="mot" if trigger=="motion" else "rec"
                filename = f"{prefix}_{timestamp}.h264"
                
                self.current_video_path = get_organized_path(SAVE_FOLDER, filename)
                
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
            if self.is_247_recording_active:
                return False, "Cannot manually stop recording during 24/7 mode. Disable 24/7 recording from Settings."
            
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
            
    
    def start_247_recording(self):
        """Starts the 24/7 recording background management thread."""
        with self._lock:
            if self.is_247_recording_active:
                return False, "24/7 recording is already active."

            if self.is_recording:
                # If a manual recording is in progress, stop it first.
                self._stop_recording_internal()
            
            self.is_247_recording_active = True
            self._247_thread = threading.Thread(target=self._247_recording_loop, daemon=True)
            self._247_thread.start()
            
            print("[REC 24/7] ▶️ Mode activated. Starting background manager.")
            # The background thread will handle publishing status via MQTT
            if self.mqtt_handler:
                self.mqtt_handler.publish_status()
                
            return True, "24/7 recording mode activated."

    def stop_247_recording(self):
        """Stops the 24/7 recording mode and the current recording segment."""
        with self._lock:
            if not self.is_247_recording_active:
                return False, "24/7 recording is not active."

            self.is_247_recording_active = False
            print("[REC 24/7] ⏹️ Mode deactivating. The current segment will be stopped.")

            # The loop will naturally exit, and the _stop_recording_internal will be called.
            # We don't need to join the thread because it's a daemon.
            
            if self.mqtt_handler:
                self.mqtt_handler.publish_status()
                
            return True, "24/7 recording mode deactivated."

    def _247_recording_loop(self):
        """The core background loop that manages continuous recording segments."""
        
        # 23 hours, 55 minutes = 86100 seconds
        RECORDING_DURATION_SECONDS = 86100 
        
        while self.is_247_recording_active:
            print("[REC 24/7] Starting new segment...")
            
            # Start a new recording. The 'trigger' helps identify it.
            success, result = self.start_recording(trigger="247")
            
            if not success:
                print("[REC 24/7] ❌ Failed to start new segment. Retrying in 60 seconds...")
                time.sleep(60)
                continue # Try again
            
            # Wait for the recording duration, but check for stop signal every second
            for _ in range(RECORDING_DURATION_SECONDS):
                if not self.is_247_recording_active:
                    break # Exit the wait loop if the mode was disabled
                time.sleep(1)

            # Stop the current recording segment
            print("[REC 24/7] Segment duration reached. Stopping and restarting...")
            self.stop_recording() # This will automatically call _stop_recording_internal
            
            # Small delay to ensure file handles are closed before starting the next one
            time.sleep(5)
            
        # After the loop exits (because is_247_recording_active became false)
        # make sure any final recording is stopped.
        if self.is_recording:
            print("[REC 24/7] Final segment cleanup.")
            self.stop_recording()
            
        print("[REC 24/7] Background manager has stopped.")        
            
    def update_camera_config(self, resolution: str = None, bitrate: int = None):
        """
        Restart the camera encoders with new settings.
        Must stop encoders, reconfigure, then restart them.
        """
        with self._lock:
            if not self.camera:
                return False, "Camera not initialized"

            if self.is_recording:
                return False, "Cannot change config while recording. Stop recording first."

            try:
                print("[CAMERA] 🔄 Updating camera config...")

                # --- Parse new resolution ---
                new_resolution = self.current_resolution
                if resolution:
                    RESOLUTION_MAP = {
                        "480p":  (854, 480),
                        "720p":  (1280, 720),
                        "1080p": (1920, 1080),
                    }
                    if resolution in RESOLUTION_MAP:
                        new_resolution = RESOLUTION_MAP[resolution]
                    else:
                        return False, f"Unknown resolution: {resolution}"

                # --- Parse new bitrate ---
                # App sends bitrate in Kbps (e.g. 8000), camera needs bps (e.g. 8000000)
                new_bitrate = self.current_bitrate
                if bitrate is not None:
                    new_bitrate = int(bitrate) * 1000
                    
                new_stream_res = get_stream_resolution(new_resolution)
                print(f"[CAMERA] New main: {new_resolution}, New stream: {new_stream_res}")    

                # --- Step 1: Stop existing JPEG encoder ---
                print("[CAMERA] Stopping encoders...")
                try:
                    self.camera.stop_encoder(self.jpeg_encoder)
                except Exception as e:
                    print(f"[CAMERA] Warning stopping jpeg encoder: {e}")

                # --- Step 2: Stop the camera ---
                try:
                    self.camera.stop()
                except Exception as e:
                    print(f"[CAMERA] Warning stopping camera: {e}")
                    
                    
                lores_width = min(new_resolution[0], 1280)
                lores_height = min(new_resolution[1], 720)    

                # --- Step 3: Reconfigure with new settings ---
                print(f"[CAMERA] Reconfiguring: {new_resolution}, {new_bitrate}bps")
                config = self.camera.create_video_configuration(
                    main={"size": new_resolution, "format": "RGB888"},
                    lores={"size": new_stream_res, "format": "YUV420"},
                    encode="lores"
                )
                self.camera.configure(config)

                # --- Step 4: Create new encoders with updated settings ---
                self.jpeg_encoder = JpegEncoder(q=JPEG_QUALITY)
                self.h264_encoder = H264Encoder(bitrate=new_bitrate)

                # --- Step 5: Restart camera and encoders ---
                self.camera.start()
                time.sleep(1)  # Give the camera time to warm up

                self.camera.start_encoder(
                    self.jpeg_encoder,
                    FileOutput(self.streaming_output),
                    name="lores"
                )

                # --- Step 6: Save the new values ---
                self.current_resolution = new_resolution
                self.current_bitrate = new_bitrate

                res_str = f"{new_resolution[0]}x{new_resolution[1]}"
                print(f"[CAMERA] ✅ Config updated: {res_str} @ {new_bitrate}bps")
                return True, f"Config updated: {res_str}"

            except Exception as e:
                print(f"[CAMERA] ❌ Config update error: {e}")
                return False, str(e)  
            
    
    def get_status(self):
        """Get camera status"""
        recording_duration = 0
        if self.is_recording and self.recording_start_time:
            recording_duration = (datetime.now() - self.recording_start_time).total_seconds()
            
        res = self.current_resolution
        resolution_str = f"{res[0]}x{res[1]}"    
        
        return {
            "initialized": self.camera is not None,
            "streaming": self.jpeg_encoder is not None,
            "recording": self.is_recording,
            "recording_duration": round(recording_duration, 1),
            "current_video": os.path.basename(self.current_video_path) if self.current_video_path else None,
            "resolution": f"{self.current_resolution[0]}x{self.current_resolution[1]}",
            "motion_detecting": self.motion_detector.state['detecting'],
            "is_247_recording_active": self.is_247_recording_active,
        }


# ============================================================
# MQTT HANDLER
# ============================================================
class MQTTHandler:
    """MQTT communication"""
    
    def __init__(self, camera_system):
        self.camera = camera_system
        self.client = mqtt.Client(client_id=MQTT_CLIENT_ID)
        self.running = False
        
        # Topics for publishing
        self.TOPIC_COMMAND = "camera/command"
        self.TOPIC_STATUS = "camera/status"
        self.TOPIC_SNAPSHOT = "camera/snapshot"
        self.TOPIC_RESPONSE = "camera/response"
        self.TOPIC_HEARTBEAT = "camera/heartbeat"
        self.TOPIC_MOTION = "camera/motion"
        self.TOPIC_RECORDING = "camera/recording"
        self.TOPIC_FILES = "camera/files"
    
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
        elif payload == "motion_start":
            self.cmd_motion_start()
        elif payload == "motion_stop":
            self.cmd_motion_stop()
        elif payload == "status":
            self.cmd_status()
        else:
            self.send_response("error", f"Unknown: {payload}")
    
    def cmd_snapshot(self):
        frame, result = self.camera.take_snapshot()
        if frame:
            self.publish_snapshot_taken(result)
            self.send_response("success", f"Snapshot: {result}")
        else:
            self.send_response("error", result)
    
    def cmd_record_start(self):
        success, result = self.camera.start_recording()
        if success:
            self.publish_recording_started(result)
            self.send_response("success", f"Recording: {result}")
        else:
            self.send_response("error", result)
    
    def cmd_record_stop(self):
        success, result = self.camera.stop_recording()
        if success:
            self.publish_recording_stopped(result)
            self.send_response("success", "Recording stopped", result)
        else:
            self.send_response("error", result)
    
    def cmd_motion_start(self):
        success, msg = self.camera.motion_detector.start()
        self.send_response("success" if success else "error", msg)
        self.publish_status()
    
    def cmd_motion_stop(self):
        success, msg = self.camera.motion_detector.stop()
        self.send_response("success" if success else "error", msg)
        self.publish_status()
    
    def cmd_status(self):
        self.publish_status()
    
    def publish_status(self):
        """Publish current status"""
        status = self.camera.get_status()
        status["timestamp"] = datetime.now().isoformat()
        status["online"] = True
        
        self.client.publish(self.TOPIC_STATUS, json.dumps(status), retain=True, qos=1)
    
    def publish_motion_detected(self, confidence, filename):
        """Publish when motion is detected"""
        payload = {
            "timestamp": datetime.now().isoformat(),
            "type": "motion_detected",
            "confidence": confidence,
            "snapshot": filename
        }
        self.client.publish(self.TOPIC_MOTION, json.dumps(payload), qos=1)
        print(f"[MQTT] Published motion alert")
    
    def publish_recording_started(self, filename):
        """Publish when recording starts"""
        payload = {
            "timestamp": datetime.now().isoformat(),
            "type": "recording_started",
            "filename": filename
        }
        self.client.publish(self.TOPIC_RECORDING, json.dumps(payload), qos=1)
        self.publish_status()
    
    def publish_recording_stopped(self, data):
        """Publish when recording stops"""
        payload = {
            "timestamp": datetime.now().isoformat(),
            "type": "recording_stopped",
            "filename": data.get("filename"),
            "duration": data.get("duration"),
            "size": data.get("size")
        }
        self.client.publish(self.TOPIC_RECORDING, json.dumps(payload), qos=1)
        self.publish_status()
    
    def publish_snapshot_taken(self, filename):
        """Publish when snapshot is taken"""
        payload = {
            "timestamp": datetime.now().isoformat(),
            "type": "snapshot_taken",
            "filename": filename
        }
        self.client.publish(self.TOPIC_SNAPSHOT, json.dumps(payload), qos=1)
    
    def send_response(self, status, message, data=None):
        response = {
            "timestamp": datetime.now().isoformat(),
            "status": status,
            "message": message
        }
        if data:
            response["data"] = data
        self.client.publish(self.TOPIC_RESPONSE, json.dumps(response))
    
    def heartbeat_loop(self):
        """Publish heartbeat + status every 30 seconds"""
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
            self.publish_status()
    
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


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle requests in a separate thread."""
    daemon_threads = True # So threads don't block shutdown

# ============================================================
# WEB SERVER
# ============================================================
class WebHandler(BaseHTTPRequestHandler):
    """HTTP request handler"""
    
    camera_system = None
    
    def do_GET(self):
        if self.path == '/':
            self._serve_index()
        elif self.path == '/stream.mjpg':
            self._serve_stream()
        elif self.path == '/api/status':
            self._serve_api_status()
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
        elif self.path == '/api/camera/config':   
            self._serve_camera_config()    
        elif self.path == '/api/storage/status':  
            self._serve_storage_status()          
        elif self.path == '/api/storage/config': 
            self._serve_storage_config()              
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
        elif self.path == '/api/camera/config':   
            self._api_update_camera_config()  
        elif self.path == '/api/push/register':  
            self._api_register_push_token() 
        elif self.path == '/api/recording/247/start': 
            self._api_start_247_recording()           
        elif self.path == '/api/recording/247/stop':  
            self._api_stop_247_recording()     
        elif self.path == '/api/storage/config':  
            self._api_update_storage_config()            
        else:
            self._serve_404()
    
    def do_DELETE(self):
        if self.path.startswith('/api/files/snapshot/'):
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
        html = """<!DOCTYPE html>
<html>
<head>
    <title>Veljko Camera System</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { background: #1a1a2e; color: white; text-align: center; font-family: sans-serif; }
        img { max-width: 100%; border: 3px solid #4CAF50; border-radius: 10px; }
        button { padding: 12px 20px; background: #4CAF50; color: white; border: none; border-radius: 8px; margin: 5px; cursor: pointer; }
    </style>
</head>
<body>
    <h1>📹 Veljko Camera System</h1>
    <img src="/stream.mjpg" alt="Live Stream">
    <br>
    <button onclick="fetch('/api/snapshot',{method:'POST'}).then(r=>r.json()).then(d=>alert(d.success?'Saved':'Error'))">📷 Snapshot</button>
    <button onclick="fetch(rec?'/api/record/stop':'/api/record/start',{method:'POST'}).then(()=>rec=!rec)" id="recbtn">🔴 Record</button>
    <script>let rec=false;</script>
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
    
    def _serve_api_status(self):
        status = WebHandler.camera_system.get_status()
        self._send_json(status)
    
    def _serve_files_snapshots(self):
        """API: List all snapshots organised by date"""
        files = list_gallery_files(
            SAVE_FOLDER,
            extensions=('.jpg', '.jpeg', '.png')
        )
        self._send_json({
            'success': True,
            'files':   files,
            'count':   len(files)
        })


    def _serve_files_videos(self):
        """API: List all videos organised by date"""
        files = list_gallery_files(
            SAVE_FOLDER,
            extensions=('.mp4', '.h264')
        )
        self._send_json({
            'success': True,
            'files':   files,
            'count':   len(files)
        })
    
    
    def _serve_single_snapshot(self):
        """Serve a single snapshot image by filename"""
        filename = os.path.basename(self.path.split('/')[-1])
        filepath = find_file_in_gallery(SAVE_FOLDER, filename)

        if not filepath:
            self.send_response(404)
            self.end_headers()
            return

        try:
            with open(filepath, 'rb') as f:
                file_data = f.read()

            self.send_response(200)
            self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Content-Length', len(file_data))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(file_data)
        except Exception:
            self.send_response(500)
            self.end_headers()


    def _serve_single_video(self):
        """Serve a single video file by filename"""
        filename = os.path.basename(self.path.split('/')[-1])
        filepath = find_file_in_gallery(SAVE_FOLDER, filename)

        if not filepath:
            self.send_response(404)
            self.end_headers()
            return

        content_type = 'video/mp4' if filename.endswith('.mp4') else 'video/h264'
        file_size=os.path.getsize(filepath)

        range_header = self.headers.get('Range')
        start = 0
        end = file_size - 1

        if range_header:
            # Range header looks like: "bytes=0-1048575" or "bytes=1048576-"
            try:
                range_spec = range_header.strip().replace('bytes=', '')
                range_start_str, range_end_str = range_spec.split('-')

                start = int(range_start_str) if range_start_str else 0
                end   = int(range_end_str)   if range_end_str   else file_size - 1

                # Clamp end to the actual file size
                end = min(end, file_size - 1)
            except (ValueError, AttributeError):
                # Malformed Range header → send the whole file
                start = 0
                end = file_size - 1

        chunk_size = end - start + 1

        try:
            with open(filepath, 'rb') as f:
                f.seek(start)

                if range_header:
                    # ── Partial Content (seeking) ────────────────────────────
                    self.send_response(206)  # 206 Partial Content
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Length', str(chunk_size))
                    self.send_header(
                        'Content-Range',
                        f'bytes {start}-{end}/{file_size}'
                    )
                    self.send_header('Accept-Ranges', 'bytes')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                else:
                    # ── Full file (first load) ───────────────────────────────
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Length', str(file_size))
                    self.send_header('Accept-Ranges', 'bytes')  # Tell client we support ranges
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()

                # ── Stream in small chunks to avoid RAM issues ───────────────
                BUFFER_SIZE = 256 * 1024  # 256 KB chunks
                bytes_remaining = chunk_size

                while bytes_remaining > 0:
                    read_size = min(BUFFER_SIZE, bytes_remaining)
                    data = f.read(read_size)
                    if not data:
                        break
                    try:
                        self.wfile.write(data)
                    except (BrokenPipeError, ConnectionResetError):
                        # Client closed the connection (e.g. exited the modal)
                        # This is normal behaviour, not an error
                        return
                    bytes_remaining -= len(data)

        except OSError as e:
            print(f"[HTTP] Video serve error: {e}")
            try:
                self.send_response(500)
                self.end_headers()
            except Exception:
                pass  # Connection already broken, nothing we can do
            
            
    def _serve_camera_config(self):
        """API: GET current camera config"""
        cam_sys=WebHandler.camera_system
        self._send_json({
            'success': True,
            'config': {
                'resolution': f"{cam_sys.current_resolution[0]}x{cam_sys.current_resolution[1]}",
                'bitrate': WebHandler.camera_system.current_bitrate,
                'jpeg_quality': JPEG_QUALITY,
            }
        })

    def _api_update_camera_config(self):
        """API: POST new camera config"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            success, message = WebHandler.camera_system.update_camera_config(
                resolution=data.get('resolution'),
                bitrate=data.get('bitrate'),
            )

            self._send_json({'success': success, 'message': message})
        except Exception as e:
            self._send_json({'success': False, 'error': str(e)})
    
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
    
    def _api_snapshot(self):
        frame, result = WebHandler.camera_system.take_snapshot()
        if frame:
            self._send_json({"success": True, "filename": result})
        else:
            self._send_json({"success": False, "error": result})
    
    def _api_record_start(self):
        success, result = WebHandler.camera_system.start_recording()
        if success:
            self._send_json({"success": True, "filename": result})
        else:
            self._send_json({"success": False, "error": result})
    
    def _api_record_stop(self):
        success, result = WebHandler.camera_system.stop_recording()
        if success:
            self._send_json({"success": True, "data": result})
        else:
            self._send_json({"success": False, "error": result})
    
    def _api_start_motion(self):
        success, msg = WebHandler.camera_system.motion_detector.start()
        
        if success and WebHandler.camera_system.mqtt_handler:
            WebHandler.camera_system.mqtt_handler.publish_status()
        self._send_json({'success': success, 'message': msg})
    
    def _api_stop_motion(self):
        success, msg = WebHandler.camera_system.motion_detector.stop()

        if success and WebHandler.camera_system.mqtt_handler:
            WebHandler.camera_system.mqtt_handler.publish_status()
        self._send_json({'success': success, 'message': msg})
    
    def _api_update_motion_config(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            md = WebHandler.camera_system.motion_detector
            md.update_config(**data)
            
            self._send_json({'success': True, 'config': md.config})
        except Exception as e:
            self._send_json({'success': False, 'error': str(e)})
    
    def _api_delete_snapshot(self):
        """DELETE /api/files/snapshot/<filename>"""
        filename = os.path.basename(self.path.split('/')[-1])
        filepath = find_file_in_gallery(SAVE_FOLDER, filename)

        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
                # Clean up empty day/month folders
                _cleanup_empty_dirs(os.path.dirname(filepath), SAVE_FOLDER)
                self._send_json({'success': True, 'filename': filename})
            except OSError as e:
                self._send_json({'success': False, 'error': str(e)})
        else:
            self._send_json({'success': False, 'error': 'File not found'})


    def _api_delete_video(self):
        """DELETE /api/files/video/<filename>"""
        filename = os.path.basename(self.path.split('/')[-1])
        filepath = find_file_in_gallery(SAVE_FOLDER, filename)

        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
                # Clean up empty day/month folders
                _cleanup_empty_dirs(os.path.dirname(filepath), SAVE_FOLDER)
                self._send_json({'success': True, 'filename': filename})
            except OSError as e:
                self._send_json({'success': False, 'error': str(e)})
        else:
            self._send_json({'success': False, 'error': 'File not found'})
    
    def _api_register_push_token(self):
        """API: Register a push notification token from the mobile app."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            token = data.get('token', '').strip()

            if not token:
                self._send_json({'success': False, 'error': 'No token provided'})
                return

            if not token.startswith('ExponentPushToken['):
                self._send_json({'success': False, 'error': 'Invalid token format'})
                return

            # Save the token globally
            push_manager.save_token(token)

            self._send_json({'success': True, 'message': 'Token registered'})

        except Exception as e:
            self._send_json({'success': False, 'error': str(e)})
            
    def _api_start_247_recording(self):
        """API: Start 24/7 recording mode"""
        success, message = WebHandler.camera_system.start_247_recording()
        self._send_json({'success': success, 'message': message})

    def _api_stop_247_recording(self):
        """API: Stop 24/7 recording mode"""
        success, message = WebHandler.camera_system.stop_247_recording()
        self._send_json({'success': success, 'message': message})        
    


    def _serve_storage_status(self):
        """API: GET current disk usage statistics."""
        status = WebHandler.storage_manager.get_status()
        self._send_json({'success': True, 'status': status})

    def _serve_storage_config(self):
        """API: GET current storage management config."""
        config = WebHandler.storage_manager.config
        self._send_json({'success': True, 'config': config})

    def _api_update_storage_config(self):
        """API: POST new storage management config."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            # Update the config in the storage manager
            new_config = WebHandler.storage_manager.update_config(**data)
            
            self._send_json({'success': True, 'config': new_config})
        except Exception as e:
            self._send_json({'success': False, 'error': str(e)})
    
    def _send_json(self, data):
        try:
            content = json.dumps(data).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(content))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(content)
        except:
            pass
    
    def _serve_404(self):
        self.send_response(404)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'Not Found')
    
    def log_message(self, format, *args):
        pass  # Suppress HTTP logs


# ============================================================
# MAIN
# ============================================================
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
    storage_manager = None
    
    
    try:
        # Camera
        camera_system = CameraSystem()
        storage_manager=StorageManager(SAVE_FOLDER,camera_system)
        camera_system.initialize()
        
        WebHandler.camera_system = camera_system
        WebHandler.storage_manager = storage_manager 
        
        # MQTT
        print("\n[MQTT] Connecting...")
        mqtt_handler = MQTTHandler(camera_system)
        camera_system.mqtt_handler = mqtt_handler
        mqtt_handler.start()
        
        if storage_manager.config['auto_delete_enabled']:
            storage_manager.start()
        
        # HTTP
        print(f"[HTTP] Starting on port {HTTP_PORT}...")
        http_server = ThreadingHTTPServer(('0.0.0.0', HTTP_PORT), WebHandler)
        
        print("\n" + "=" * 60)
        print("  ✅ SYSTEM ACTIVE!")
        print("=" * 60)
        print(f"\n  📺 Web UI:      http://{ip}:{HTTP_PORT}")
        print(f"  🎬 Stream:      http://{ip}:{HTTP_PORT}/stream.mjpg")
        print(f"\n  MQTT Commands:")
        print(f"    mosquitto_pub -t 'camera/command' -m 'snapshot'")
        print(f"    mosquitto_pub -t 'camera/command' -m 'motion_start'")
        print(f"\n  Press Ctrl+C to exit")
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
