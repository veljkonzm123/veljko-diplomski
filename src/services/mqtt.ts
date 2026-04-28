import mqtt from "mqtt";
import {
  showMotionNotification,
  showRecordingStartedNotification,
  showRecordingStoppedNotification,
  showStorageWarningNotification,
} from "./notifications";
export const TOPICS = {
  COMMAND: "camera/command",
  STATUS: "camera/status",
  SNAPSHOT: "camera/snapshot",
  RESPONSE: "camera/response",
  HEARTBEAT: "camera/heartbeat",
  MOTION: "camera/motion",
  RECORDING: "camera/recording",
  FILES: "camera/files",
  STORAGE: "camera/storage",
} as const;

type Topic = (typeof TOPICS)[keyof typeof TOPICS];

interface MQTTMessage {
  [key: string]: any;
}

type MessageCallback = (topic: Topic, message: MQTTMessage) => void;
type ConnectionCallback = (connected: boolean) => void;

class MQTTService {
  private client: mqtt.MqttClient | null = null;
  private messageListeners: MessageCallback[] = [];
  private connectionListeners: ConnectionCallback[] = [];
  private isConnected = false;

  connect(brokerIP: string, port: number = 9001) {
    console.log(`[MQTT] Connecting to ws://${brokerIP}:${port}...`);

    try {
      this.client = mqtt.connect(`ws://${brokerIP}:${port}`, {
        clientId: `camera_app_${Math.random().toString(16).substr(2, 8)}`,
        keepalive: 60,
        reconnectPeriod: 5000,
      });

      this.client.on("connect", () => {
        console.log("[MQTT] ✅ Connected");
        this.isConnected = true;
        this.notifyConnectionChange(true);

        // Subscribe to all topics
        const topicsToSubscribe = [
          TOPICS.STATUS,
          TOPICS.MOTION,
          TOPICS.RECORDING,
          TOPICS.SNAPSHOT,
          TOPICS.RESPONSE,
          TOPICS.FILES,
          TOPICS.HEARTBEAT,
          TOPICS.STORAGE,
        ];

        topicsToSubscribe.forEach((topic) => {
          this.client?.subscribe(topic, { qos: 0 }, (err) => {
            if (err) {
              console.error(`[MQTT] ❌ Subscribe failed: ${topic}`, err);
            } else {
              console.log(`[MQTT] ✅ Subscribed: ${topic}`);
            }
          });
        });
      });

      this.client.on("close", () => {
        console.log("[MQTT] ❌ Disconnected");
        this.isConnected = false;
        this.notifyConnectionChange(false);
      });

      this.client.on("error", (error) => {
        console.error("[MQTT] Error:", error.message);
        this.isConnected = false;
        this.notifyConnectionChange(false);
      });

      this.client.on("message", (topic: string, payload: Buffer) => {
        try {
          const message = payload.toString();
          console.log(`[MQTT] 📩 ${topic}:`, message);

          const parsed = JSON.parse(message);
          this.notifyMessageReceived(topic as Topic, parsed);
        } catch (error) {
          console.error("[MQTT] Parse error:", error);
        }
      });
    } catch (error) {
      console.error("[MQTT] Connection failed:", error);
    }
  }

  disconnect() {
    if (this.client) {
      console.log("[MQTT] Disconnecting...");
      this.client.end();
      this.client = null;
      this.isConnected = false;
      this.notifyConnectionChange(false);
    }
  }

  publish(topic: string, message: string) {
    if (!this.client || !this.isConnected) {
      console.warn("[MQTT] Not connected");
      return;
    }
    this.client.publish(topic, message);
  }

  onMessage(callback: MessageCallback): () => void {
    this.messageListeners.push(callback);
    return () => {
      this.messageListeners = this.messageListeners.filter(
        (cb) => cb !== callback,
      );
    };
  }

  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionListeners.push(callback);
    return () => {
      this.connectionListeners = this.connectionListeners.filter(
        (cb) => cb !== callback,
      );
    };
  }

  private notifyMessageReceived(topic: Topic, message: MQTTMessage) {
    try {
      if (topic === TOPICS.MOTION) {
        // Fire immediately, don't await - we don't want to block message delivery
        showMotionNotification().catch((e) =>
          console.warn("[MQTT] Motion notification failed:", e),
        );
      }

      if (topic === TOPICS.RECORDING) {
        if (message.type === "recording_started") {
          showRecordingStartedNotification().catch((e) =>
            console.warn("[MQTT] Recording start notification failed:", e),
          );
        } else if (message.type === "recording_stopped") {
          showRecordingStoppedNotification(
            message.duration ?? 0,
            message.filename ?? "unknown",
          ).catch((e) =>
            console.warn("[MQTT] Recording stop notification failed:", e),
          );
        }
      }
      if (topic === TOPICS.STORAGE) {
        if (message.type === "storage_warning") {
          showStorageWarningNotification(
            message.used_pct ?? 0,
            message.free_gb ?? 0,
          ).catch((e) =>
            console.warn("[MQTT] Storage notification failed:", e),
          );
        }
      }
    } catch (e) {
      console.warn("[MQTT] Notification error:", e);
    }

    this.messageListeners.forEach((callback) => {
      try {
        callback(topic, message);
      } catch (error) {
        console.error("[MQTT] Listener error:", error);
      }
    });
  }

  private notifyConnectionChange(connected: boolean) {
    this.connectionListeners.forEach((callback) => {
      try {
        callback(connected);
      } catch (error) {
        console.error("[MQTT] Listener error:", error);
      }
    });
  }
}

export const mqttService = new MQTTService();