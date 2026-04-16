export const CAMERA_IP = "192.168.1.8";
export const CAMERA_PORT = 8080;

export const MQTT_BROKER = "192.168.1.8";
export const MQTT_WS_PORT = 9001;
export const MQTT_URL = `ws://${MQTT_BROKER}:${MQTT_WS_PORT}`;

export const STREAM_URL = `http://${CAMERA_IP}:${CAMERA_PORT}/stream.mjpg`;
export const API_BASE_URL = `http://${CAMERA_IP}:${CAMERA_PORT}`;

export const API = {
  SNAPSHOT: "/api/snapshot",
  RECORD_START: "/api/record/start",
  RECORD_STOP: "/api/record/stop",
  STATUS: "/api/status",
};
