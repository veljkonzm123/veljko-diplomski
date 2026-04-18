import paho.mqtt.client as mqtt
from picamera2 import Picamera2
from picamera2.encoders import H264Encoder
from picamera2.outputs import FileOutput
import time
import json
import base64
import threading
import os
from datetime import datetime

# ============================================================
# PODESAVANJA
# ============================================================
BROKER_HOST = "localhost"
BROKER_PORT = 1883
CLIENT_ID = "veljko-camera"

RESOLUTION = (1280, 720)
VIDEO_BITRATE = 5000000

SAVE_FOLDER = "/home/gorannik/veljko-diplomski/recordings"
# ============================================================


class CameraController:
    """Kontroler za kameru"""
    
    def __init__(self):
        self.camera = None
        self.is_recording = False
        self.current_video_path = None
        self.encoder = None
        self.output = None
        
    def initialize(self):
        """Inicijalizuj kameru"""
        print("[CAMERA] Inicijalizacija...")
        self.camera = Picamera2()
        
        config = self.camera.create_video_configuration(
            main={"size": RESOLUTION, "format": "RGB888"}
        )
        self.camera.configure(config)
        self.camera.start()
        
        # Sačekaj stabilizaciju
        time.sleep(1)
        print("[CAMERA] Kamera spremna!")
        
    def close(self):
        """Zatvori kameru"""
        if self.is_recording:
            self.stop_recording()
        if self.camera:
            self.camera.stop()
            self.camera.close()
            self.camera = None
        print("[CAMERA] Kamera zatvorena.")
    
    def take_snapshot(self):
        """Napravi screenshot i vrati kao bytes"""
        if not self.camera:
            return None, "Kamera nije inicijalizovana"
        
        try:
            # Generiši ime fajla
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"snapshot_{timestamp}.jpg"
            filepath = os.path.join(SAVE_FOLDER, filename)
            
            # Snimi sliku
            self.camera.capture_file(filepath)
            
            # Pročitaj sliku kao bytes
            with open(filepath, 'rb') as f:
                image_data = f.read()
            
            print(f"[CAMERA] Snapshot: {filename} ({len(image_data)} bytes)")
            return image_data, filename
            
        except Exception as e:
            print(f"[CAMERA] Greška pri snapshot-u: {e}")
            return None, str(e)
    
    def start_recording(self):
        """Započni snimanje videa"""
        if not self.camera:
            return False, "Kamera nije inicijalizovana"
        
        if self.is_recording:
            return False, "Snimanje je već u toku"
        
        try:
            # Generiši ime fajla
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"video_{timestamp}.h264"
            self.current_video_path = os.path.join(SAVE_FOLDER, filename)
            
            # Kreiraj encoder i output
            self.encoder = H264Encoder(bitrate=VIDEO_BITRATE)
            self.output = FileOutput(self.current_video_path)
            
            # Započni snimanje
            self.camera.start_encoder(self.encoder, self.output)
            self.is_recording = True
            
            print(f"[CAMERA] Snimanje započeto: {filename}")
            return True, filename
            
        except Exception as e:
            print(f"[CAMERA] Greška pri pokretanju snimanja: {e}")
            return False, str(e)
    
    def stop_recording(self):
        """Zaustavi snimanje"""
        if not self.is_recording:
            return False, "Snimanje nije u toku"
        
        try:
            self.camera.stop_encoder()
            self.is_recording = False
            
            # Dobij info o fajlu
            filepath = self.current_video_path
            filename = os.path.basename(filepath)
            filesize = os.path.getsize(filepath)
            
            self.current_video_path = None
            self.encoder = None
            self.output = None
            
            print(f"[CAMERA] Snimanje zaustavljeno: {filename} ({filesize} bytes)")
            return True, {"filename": filename, "size": filesize}
            
        except Exception as e:
            print(f"[CAMERA] Greška pri zaustavljanju: {e}")
            return False, str(e)
    
    def get_status(self):
        """Vrati status kamere"""
        return {
            "initialized": self.camera is not None,
            "recording": self.is_recording,
            "current_video": os.path.basename(self.current_video_path) if self.current_video_path else None,
            "resolution": f"{RESOLUTION[0]}x{RESOLUTION[1]}"
        }


class MQTTCameraController:
    """MQTT kontroler za kameru"""
    
    def __init__(self):
        self.camera = CameraController()
        self.client = mqtt.Client(client_id=CLIENT_ID)
        self.running = False
        
        # MQTT topics
        self.TOPIC_COMMAND = "camera/command"
        self.TOPIC_STATUS = "camera/status"
        self.TOPIC_SNAPSHOT = "camera/snapshot"
        self.TOPIC_RESPONSE = "camera/response"
        self.TOPIC_HEARTBEAT = "camera/heartbeat"
        
    def on_connect(self, client, userdata, flags, rc):
        """MQTT connect callback"""
        if rc == 0:
            print("[MQTT] Povezan na broker!")
            
            # Pretplati se na komande
            client.subscribe(self.TOPIC_COMMAND)
            print(f"[MQTT] Pretplaćen na: {self.TOPIC_COMMAND}")
            
            # Pošalji online status
            self.publish_status()
        else:
            print(f"[MQTT] Greška pri povezivanju: {rc}")
    
    def on_message(self, client, userdata, msg):
        """MQTT message callback"""
        topic = msg.topic
        payload = msg.payload.decode('utf-8')
        
        print(f"\n[MQTT] Primljena komanda: {payload}")
        
        if topic == self.TOPIC_COMMAND:
            self.handle_command(payload)
    
    def handle_command(self, command):
        """Obradi komandu"""
        command = command.strip().lower()
        
        if command == "snapshot":
            self.cmd_snapshot()
            
        elif command == "record_start":
            self.cmd_record_start()
            
        elif command == "record_stop":
            self.cmd_record_stop()
            
        elif command == "status":
            self.cmd_status()
            
        else:
            self.send_response("error", f"Nepoznata komanda: {command}")
    
    def cmd_snapshot(self):
        """Komanda: snapshot"""
        print("[CMD] Izvršavam snapshot...")
        
        image_data, result = self.camera.take_snapshot()
        
        if image_data:
            # Pošalji sliku kao base64
            image_base64 = base64.b64encode(image_data).decode('utf-8')
            
            payload = {
                "timestamp": datetime.now().isoformat(),
                "filename": result,
                "size": len(image_data),
                "image": image_base64
            }
            
            self.client.publish(self.TOPIC_SNAPSHOT, json.dumps(payload))
            self.send_response("success", f"Snapshot sačuvan: {result}")
        else:
            self.send_response("error", f"Snapshot greška: {result}")
    
    def cmd_record_start(self):
        """Komanda: record_start"""
        print("[CMD] Pokrećem snimanje...")
        
        success, result = self.camera.start_recording()
        
        if success:
            self.send_response("success", f"Snimanje pokrenuto: {result}")
            self.publish_status()
        else:
            self.send_response("error", f"Greška: {result}")
    
    def cmd_record_stop(self):
        """Komanda: record_stop"""
        print("[CMD] Zaustavljam snimanje...")
        
        success, result = self.camera.stop_recording()
        
        if success:
            self.send_response("success", f"Snimanje zaustavljeno", result)
            self.publish_status()
        else:
            self.send_response("error", f"Greška: {result}")
    
    def cmd_status(self):
        """Komanda: status"""
        print("[CMD] Šaljem status...")
        self.publish_status()
    
    def send_response(self, status, message, data=None):
        """Pošalji odgovor"""
        response = {
            "timestamp": datetime.now().isoformat(),
            "status": status,
            "message": message
        }
        if data:
            response["data"] = data
        
        self.client.publish(self.TOPIC_RESPONSE, json.dumps(response))
        print(f"[MQTT] Odgovor: {status} - {message}")
    
    def publish_status(self):
        """Pošalji status kamere"""
        status = self.camera.get_status()
        status["timestamp"] = datetime.now().isoformat()
        status["online"] = True
        
        self.client.publish(self.TOPIC_STATUS, json.dumps(status))
    
    def heartbeat_loop(self):
        """Heartbeat thread"""
        counter = 0
        while self.running:
            time.sleep(30)
            if not self.running:
                break
            
            counter += 1
            heartbeat = {
                "timestamp": datetime.now().isoformat(),
                "counter": counter,
                "recording": self.camera.is_recording
            }
            self.client.publish(self.TOPIC_HEARTBEAT, json.dumps(heartbeat))
            print(f"[HEARTBEAT] #{counter}")
    
    def start(self):
        """Pokreni kontroler"""
        print("=" * 50)
        print("MQTT CAMERA CONTROLLER")
        print("=" * 50)
        
        try:
            # Inicijalizuj kameru
            self.camera.initialize()
            
            # Konfiguriši MQTT
            self.client.on_connect = self.on_connect
            self.client.on_message = self.on_message
            
            # Last Will - offline status
            will_payload = json.dumps({"online": False, "timestamp": datetime.now().isoformat()})
            self.client.will_set(self.TOPIC_STATUS, will_payload, qos=1, retain=True)
            
            # Poveži se
            print(f"\n[MQTT] Povezujem se na {BROKER_HOST}:{BROKER_PORT}...")
            self.client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
            
            self.running = True
            
            # Pokreni heartbeat thread
            heartbeat_thread = threading.Thread(target=self.heartbeat_loop, daemon=True)
            heartbeat_thread.start()
            
            # Pokreni MQTT loop
            print("\n" + "=" * 50)
            print("KONTROLER AKTIVAN!")
            print("=" * 50)
            print("\nKomande (iz drugog terminala):")
            print('  mosquitto_pub -h localhost -t "camera/command" -m "snapshot"')
            print('  mosquitto_pub -h localhost -t "camera/command" -m "record_start"')
            print('  mosquitto_pub -h localhost -t "camera/command" -m "record_stop"')
            print('  mosquitto_pub -h localhost -t "camera/command" -m "status"')
            print("\nPraćenje odgovora:")
            print('  mosquitto_sub -h localhost -t "camera/#" -v')
            print("\nCtrl+C za izlaz")
            print("=" * 50 + "\n")
            
            self.client.loop_forever()
            
        except KeyboardInterrupt:
            print("\n\n[INFO] Zaustavljanje...")
            
        finally:
            self.running = False
            
            # Pošalji offline status
            offline_status = {"online": False, "timestamp": datetime.now().isoformat()}
            self.client.publish(self.TOPIC_STATUS, json.dumps(offline_status))
            
            self.client.loop_stop()
            self.client.disconnect()
            self.camera.close()
            print("[OK] Kontroler zaustavljen.")


def main():
    
    os.makedirs(SAVE_FOLDER, exist_ok=True)
    
    controller = MQTTCameraController()
    controller.start()


if __name__ == "__main__":
    main()