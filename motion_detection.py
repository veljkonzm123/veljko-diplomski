# motion_detector.py

import threading
import time
import numpy as np
import io
import os
from datetime import datetime
from PIL import Image, ImageFilter

# Optional: OpenCV for advanced detection (falls back to numpy if not available)
try:
    import cv2
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False
    print("⚠️ OpenCV not installed - using basic motion detection")


class MotionDetector:
    """
    Motion detection running in a background thread.
    Uses existing MJPEG stream frames for efficiency.
    """
    
    DEFAULT_CONFIG = {
        'enabled': False,
        'sensitivity': 45,          # 0-100 (higher = more sensitive)
        'min_area': 1400,           # Minimum changed pixels to trigger
        'cooldown': 10,              # Seconds between triggers
        'auto_record': True,        # Auto-start recording on motion
        'record_duration': 10,      # Auto-stop recording after N seconds
        'blur_radius': 2,           # Noise reduction (0 = disabled)
        'use_adaptive_bg': True,    # Use weighted background averaging
        'bg_adaptation_rate': 0.4,  # How fast background adapts (0.1-0.5)
        'detection_mode': 'hybrid', # 'simple', 'contour', or 'hybrid'
    }
    
    def __init__(self, camera_system, events_folder='storage/events'):
        self.camera_system = camera_system
        self.events_folder = events_folder
        os.makedirs(events_folder, exist_ok=True)
        
        # Config and state
        self.config = self.DEFAULT_CONFIG.copy()
        self.state = {
            'detecting': False,
            'last_trigger_time': 0,
            'motion_count': 0,
            'avg_frame': None,          # For adaptive background
            'previous_frame': None,     # For simple diff
        }
        
        self._thread = None
        self._stop_timer = None
        
    # ─────────────────────────────────────────
    # PUBLIC METHODS
    # ─────────────────────────────────────────
    
    def start(self):
        """Start motion detection"""
        if self.state['detecting']:
            return False, "Already detecting"
        
        self.config['enabled'] = True
        self.state['detecting'] = True
        self.state['avg_frame'] = None
        self.state['previous_frame'] = None
        self.state['motion_count'] = 0
        
        self._thread = threading.Thread(target=self._detection_loop, daemon=True)
        self._thread.start()
        
        print("🔍 Motion detection started")
        print(f"   Config: sensitivity={self.config['sensitivity']}, min_area={self.config['min_area']}")
        return True, "Motion detection started"
    
    def stop(self):
        """Stop motion detection"""
        if not self.state['detecting']:
            return False, "Not currently detecting"
        
        self.state['detecting'] = False
        self.config['enabled'] = False
        
        # Cancel any pending auto-stop timer
        if self._stop_timer:
            self._stop_timer.cancel()
            self._stop_timer = None
        
        print(f"🔍 Motion detection stopped (detected {self.state['motion_count']} events)")
        return True, "Motion detection stopped"
    
    def update_config(self, **kwargs):
        """Update configuration with keyword arguments."""
        # No lock needed here - called from HTTP handler thread
        for key, value in kwargs.items():
            if key in self.config:
                try:
                    target_type = type(self.config[key])
                    self.config[key] = target_type(value)
                    print(f"[MOTION] Config updated: {key} = {self.config[key]}")
                except (ValueError, TypeError):
                    print(f"[MOTION] Warning: Could not set {key} to {value}")
        return self.config
    
    # ─────────────────────────────────────────
    # DETECTION LOOP
    # ─────────────────────────────────────────
    
    def _detection_loop(self):
        """Main detection loop - runs in background thread"""
        frame_count = 0
        
        while self.state['detecting']:
            try:
                # 1. Get frame from existing stream (efficient - no extra capture)
                frame_bytes = self.camera_system.get_frame()
                if not frame_bytes:
                    time.sleep(0.3)
                    continue
                
                frame_count += 1
                
                # 2. Preprocess frame
                processed_frame = self._preprocess_frame(frame_bytes)
                if processed_frame is None:
                    continue
                
                # 3. Detect motion
                motion_detected, confidence = self._analyze_motion(processed_frame)
                
                # 4. Handle motion if detected
                if motion_detected:
                    if self._check_cooldown():
                        self._handle_motion(frame_bytes, confidence)
                
                # 5. Update background/previous frame
                self._update_background(processed_frame)
                
                # Sleep to control CPU usage (check ~3-4 times per second)
                time.sleep(0.25)
                
            except Exception as e:
                print(f"❌ Motion detection error: {e}")
                import traceback
                traceback.print_exc()
                time.sleep(1)
    
    def _preprocess_frame(self, frame_bytes):
        """Convert JPEG bytes to grayscale numpy array"""
        try:
            # Open and convert to grayscale
            img = Image.open(io.BytesIO(frame_bytes)).convert('L')
            
            # Resize for faster processing (320x240 is good balance)
            img = img.resize((320, 240), Image.Resampling.LANCZOS)
            
            # Apply blur for noise reduction
            if self.config['blur_radius'] > 0:
                img = img.filter(ImageFilter.GaussianBlur(radius=self.config['blur_radius']))
            
            # Convert to numpy array (use float32 for better math)
            return np.array(img, dtype=np.float32)
            
        except Exception as e:
            print(f"❌ Frame preprocessing error: {e}")
            return None
    
    def _analyze_motion(self, current_frame):
        """
        Analyze frame for motion.
        Returns: (motion_detected: bool, confidence: float)
        """
        # Initialize on first frame
        if self.state['previous_frame'] is None and self.state['avg_frame'] is None:
            return False, 0
        
        mode = self.config['detection_mode']
        
        if mode == 'simple':
            return self._detect_simple(current_frame)
        elif mode == 'contour' and HAS_OPENCV:
            return self._detect_contour(current_frame)
        else:  # hybrid or fallback
            return self._detect_hybrid(current_frame)
    
    def _detect_simple(self, current_frame):
        """Simple pixel difference detection"""
        if self.state['previous_frame'] is None:
            return False, 0
        
        # Calculate absolute difference
        diff = np.abs(current_frame - self.state['previous_frame'])
        
        # Apply threshold based on sensitivity
        # sensitivity 0 = threshold 255 (nothing detected)
        # sensitivity 100 = threshold 0 (everything detected)
        threshold = 255 * (1 - self.config['sensitivity'] / 100)
        
        # Count pixels above threshold
        changed_pixels = np.sum(diff > threshold)
        
        # Calculate confidence as percentage of frame
        total_pixels = current_frame.shape[0] * current_frame.shape[1]
        confidence = (changed_pixels / total_pixels) * 100
        
        motion_detected = changed_pixels > self.config['min_area']
        
        return motion_detected, confidence
    
    def _detect_contour(self, current_frame):
        """OpenCV contour-based detection (more accurate)"""
        if self.state['avg_frame'] is None:
            return False, 0
        
        # Get difference from background
        frame_delta = cv2.absdiff(
            current_frame.astype(np.uint8),
            self.state['avg_frame'].astype(np.uint8)
        )
        
        # Threshold
        threshold = int(255 * (1 - self.config['sensitivity'] / 100))
        _, thresh = cv2.threshold(frame_delta, threshold, 255, cv2.THRESH_BINARY)
        
        # Dilate to fill gaps
        thresh = cv2.dilate(thresh, None, iterations=2)
        
        # Find contours
        contours, _ = cv2.findContours(
            thresh.astype(np.uint8),
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        # Filter by area
        valid_contours = [c for c in contours if cv2.contourArea(c) >= self.config['min_area']]
        
        if not valid_contours:
            return False, 0
        
        # Calculate confidence
        total_area = sum(cv2.contourArea(c) for c in valid_contours)
        frame_area = current_frame.shape[0] * current_frame.shape[1]
        confidence = min(100, (total_area / frame_area) * 100 * 5)
        
        return True, confidence
    
    def _detect_hybrid(self, current_frame):
        """Hybrid: uses adaptive background + simple thresholding"""
        # Use adaptive background if available, otherwise previous frame
        reference = self.state['avg_frame'] if self.config['use_adaptive_bg'] else self.state['previous_frame']
        
        if reference is None:
            return False, 0
        
        # Calculate difference
        diff = np.abs(current_frame - reference)
        
        # Threshold
        threshold = 255 * (1 - self.config['sensitivity'] / 100)
        motion_mask = diff > threshold
        
        # Count changed pixels
        changed_pixels = np.sum(motion_mask)
        
        # Calculate confidence
        total_pixels = current_frame.shape[0] * current_frame.shape[1]
        confidence = (changed_pixels / total_pixels) * 100 * 2  # Scale up
        
        motion_detected = changed_pixels > self.config['min_area']
        
        # Debug output (comment out in production)
        # if changed_pixels > 100:
        #     print(f"[DEBUG] Changed: {changed_pixels}, Threshold: {threshold:.1f}, Detected: {motion_detected}")
        
        return motion_detected, min(confidence, 100)
    
    def _update_background(self, current_frame):
        """Update background model"""
        # Always update previous frame
        self.state['previous_frame'] = current_frame.copy()
        
        # Adaptive background averaging
        if self.config['use_adaptive_bg']:
            if self.state['avg_frame'] is None:
                self.state['avg_frame'] = current_frame.copy()
            else:
                alpha = self.config['bg_adaptation_rate']
                self.state['avg_frame'] = (
                    alpha * current_frame + 
                    (1 - alpha) * self.state['avg_frame']
                )
    
    def _check_cooldown(self):
        """Check if cooldown period has passed"""
        now = time.time()
        elapsed = now - self.state['last_trigger_time']
        return elapsed > self.config['cooldown']
    
    # ─────────────────────────────────────────
    # MOTION HANDLING
    # ─────────────────────────────────────────
    
    def _handle_motion(self, frame_bytes, confidence):
        """Handle detected motion event"""
        timestamp = datetime.now()
        self.state['last_trigger_time'] = time.time()
        self.state['motion_count'] += 1
        
        print(f"🚨 MOTION DETECTED! Confidence: {confidence:.1f}% (Event #{self.state['motion_count']})")
        
        
        
        filename = f"motion_{timestamp.strftime('%Y%m%d_%H%M%S')}.jpg"
        
        try:
            from main import get_organized_path, SAVE_FOLDER
            filepath = get_organized_path(SAVE_FOLDER, filename)
        except ImportError:
            # Fallback: save to events folder if import fails
            filepath = os.path.join(self.events_folder, filename)
        
        saved_filename = None
        try:
            with open(filepath, 'wb') as f:
                f.write(frame_bytes)
            saved_filename = filename  # ✅ Store it for use below
            print(f"📸 Saved motion snapshot: {filepath}")
        except Exception as e:
            print(f"❌ Failed to save snapshot: {e}")
        
        # 2. Publish MQTT alert
        self._publish_mqtt_alert(confidence, saved_filename)
        
        # 3. Auto-start recording
        if self.config['auto_record']:
            self._auto_start_recording()
        
        # 4. Send push notification
        
        try:
            from main import push_manager
            push_manager.send(
                title="🏃 Motion Detected!",
                body=f"Movement detected at {timestamp.strftime('%H:%M:%S')}",
                data={
                    "type": "motion_detected",
                    "confidence": confidence,
                    "snapshot": saved_filename,  # ✅ Correct variable name
                    "timestamp": timestamp.isoformat(),
                }
            )
        except Exception as e:
            # Non-fatal: don't let push errors crash motion detection
            print(f"[PUSH] Notification error: {e}")
    
    def _publish_mqtt_alert(self, confidence, filename):
        """Publish motion alert via MQTT"""
        try:
            if hasattr(self.camera_system, 'mqtt_handler') and self.camera_system.mqtt_handler:
                self.camera_system.mqtt_handler.publish_motion_detected(confidence, filename)
        except Exception as e:
            print(f"❌ MQTT publish error: {e}")
    
    def _auto_start_recording(self):
        """Auto-start recording with auto-stop timer"""
        if not self.camera_system.is_recording:
            print("📹 Auto-starting recording due to motion")
            self.camera_system.start_recording(trigger="motion")
            
            # Cancel existing timer if any
            if self._stop_timer:
                self._stop_timer.cancel()
            
            # Set auto-stop timer
            duration = self.config['record_duration']
            self._stop_timer = threading.Timer(duration, self._auto_stop_recording)
            self._stop_timer.start()
            print(f"⏱️ Will auto-stop in {duration}s")
    
    def _auto_stop_recording(self):
        """Auto-stop recording after timer expires"""
        if self.camera_system.is_recording:
            # Only stop if no recent motion
            elapsed = time.time() - self.state['last_trigger_time']
            
            if elapsed >= self.config['cooldown']:
                print("⏹ Auto-stopping motion recording (timer expired)")
                self.camera_system.stop_recording()
            else:
                # Motion still happening, extend recording
                print("⏱️ Motion still active, extending recording...")
                self._stop_timer = threading.Timer(
                    self.config['record_duration'],
                    self._auto_stop_recording
                )
                self._stop_timer.start()
    
    # ─────────────────────────────────────────
    # STATUS / DEBUG
    # ─────────────────────────────────────────
    
    def get_status(self):
        """Get current status for API"""
        return {
            'detecting': self.state['detecting'],
            'motion_count': self.state['motion_count'],
            'last_trigger': self.state['last_trigger_time'],
            'config': self.config.copy()
        }
    
    def debug_frame(self, frame_bytes):
        """
        Debug helper: analyze a single frame and return results.
        Useful for tuning sensitivity via API.
        """
        processed = self._preprocess_frame(frame_bytes)
        if processed is None:
            return {'error': 'Failed to process frame'}
        
        if self.state['previous_frame'] is None:
            self._update_background(processed)
            return {'status': 'initialized', 'message': 'Background initialized'}
        
        motion, confidence = self._analyze_motion(processed)
        
        return {
            'motion_detected': motion,
            'confidence': round(confidence, 2),
            'threshold': 255 * (1 - self.config['sensitivity'] / 100),
            'min_area': self.config['min_area']
        }
