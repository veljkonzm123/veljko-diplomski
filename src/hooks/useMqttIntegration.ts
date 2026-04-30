import { useEffect, useState } from "react";
import { Alert, Vibration } from "react-native";
import { mqttService, TOPICS } from "../services/mqtt";
import {
  CameraStatus,
  StatusMessage,
  MotionMessage,
  RecordingMessage,
  StorageMessage,
} from "../api";

interface Props {
  cameraIp: string;
  setStatus: React.Dispatch<React.SetStateAction<CameraStatus | null>>;
}

export function useMqttIntegration({ cameraIp, setStatus }: Props) {
  const [mqttConnected, setMqttConnected] = useState(false);

  useEffect(() => {
    console.log("[APP] Connecting to MQTT...");
    mqttService.connect(cameraIp);

    const unsubMessage = mqttService.onMessage((topic, message) => {
      // Status updates
      if (topic === TOPICS.STATUS) {
        const msg = message as StatusMessage;
        setStatus({
          initialized: msg.initialized,
          streaming: msg.streaming,
          recording: msg.recording,
          recording_duration: msg.recording_duration,
          current_video: msg.current_video,
          resolution: msg.resolution,
          motion_detecting: msg.motion_detecting,
          is_247_recording_active: msg.is_247_recording_active,
        });
      }

      // Motion alerts
      if (topic === TOPICS.MOTION) {
        const msg = message as MotionMessage;
        Vibration.vibrate(500);
        Alert.alert(
          "🚨 Motion Detected!",
          `Confidence: ${msg.confidence.toFixed(1)}%\nSnapshot: ${msg.snapshot}`,
        );
      }

      // Storage warnings
      if (topic === TOPICS.STORAGE) {
        const msg = message as StorageMessage;
        if (msg.type === "storage_warning") {
          Vibration.vibrate([0, 200, 100, 200]);
        }
      }

      // Recording events
      if (topic === TOPICS.RECORDING) {
        const msg = message as RecordingMessage;
        if (msg.type === "recording_started") {
          Alert.alert("🔴 Recording Started", `File: ${msg.filename}`);
        } else if (msg.type === "recording_stopped") {
          Alert.alert(
            "⏹ Recording Stopped",
            `Duration: ${msg.duration?.toFixed(1)}s`,
          );
        }
      }

      // Snapshot events
      if (topic === TOPICS.SNAPSHOT) {
        const msg = message as any;
        if (msg.type === "snapshot_taken") {
          Alert.alert("📷 Snapshot Saved", `File: ${msg.filename}`);
        }
      }
    });

    const unsubConnection = mqttService.onConnectionChange((connected) => {
      setMqttConnected(connected);
      console.log(`[MQTT] ${connected ? "Connected" : "Disconnected"}`);
    });

    return () => {
      unsubMessage();
      unsubConnection();
      mqttService.disconnect();
    };
  }, [cameraIp]);

  return { mqttConnected };
}
