import { useState } from "react";
import { Alert } from "react-native";
import { CameraAPI, CameraStatus } from "../api";
import { LoadingState } from "../types/app";

interface Props {
  status: CameraStatus | null;
  setStatus: React.Dispatch<React.SetStateAction<CameraStatus | null>>;
  withStreamPaused: <T>(
    reason: string,
    apiCall: () => Promise<T>,
  ) => Promise<T>;
}

export function useCameraControls({
  status,
  setStatus,
  withStreamPaused,
}: Props) {
  const [loading, setLoading] = useState<LoadingState>({
    snapshot: false,
    recording: false,
    motion: false,
  });

  const handleSnapshot = async () => {
    setLoading((prev) => ({ ...prev, snapshot: true }));
    try {
      const result = await withStreamPaused("📷 Taking snapshot...", () =>
        CameraAPI.takeSnapshot(),
      );
      if (!result.success) {
        Alert.alert("❌ Failed", result.error || "Unknown error");
      }
    } catch (error: any) {
      Alert.alert("❌ Error", error.message);
    } finally {
      setLoading((prev) => ({ ...prev, snapshot: false }));
    }
  };

  const handleToggleRecording = async () => {
    const isCurrentlyRecording = status?.recording || false;
    setLoading((prev) => ({ ...prev, recording: true }));

    try {
      if (isCurrentlyRecording) {
        const result = await withStreamPaused("⏹ Stopping recording...", () =>
          CameraAPI.stopRecording(),
        );

        if (result.success) {
          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  recording: false,
                  recording_duration: 0,
                  current_video: null,
                }
              : prev,
          );

          const duration = result.data?.duration?.toFixed(1) || "0";
          const sizeKB = ((result.data?.size || 0) / 1024).toFixed(1);
          Alert.alert(
            "⏹ Stopped",
            `Duration: ${duration}s\nSize: ${sizeKB} KB`,
          );
        } else {
          Alert.alert("❌ Failed", result.error || "Unknown error");
        }
      } else {
        const result = await withStreamPaused("🔴 Starting recording...", () =>
          CameraAPI.startRecording(),
        );

        if (result.success) {
          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  recording: true,
                  recording_duration: 0,
                  current_video: result.filename || null,
                }
              : prev,
          );

          Alert.alert("🔴 Recording", `File: ${result.filename}`);
        } else {
          Alert.alert("❌ Failed", result.error || "Unknown error");
        }
      }
    } catch (error: any) {
      Alert.alert("❌ Error", error.message);
    } finally {
      setLoading((prev) => ({ ...prev, recording: false }));
    }
  };

  const handleToggleMotion = async () => {
    const isCurrentlyDetecting = status?.motion_detecting || false;
    setLoading((prev) => ({ ...prev, motion: true }));

    try {
      if (isCurrentlyDetecting) {
        const result = await withStreamPaused(
          "⏹ Stopping motion detection...",
          () => CameraAPI.stopMotionDetection(),
        );

        if (result.success) {
          setStatus((prev) =>
            prev ? { ...prev, motion_detecting: false } : prev,
          );
          Alert.alert("🎯 Motion Detection", "Stopped successfully");
        } else {
          Alert.alert(
            "❌ Error",
            result.error || "Failed to stop motion detection",
          );
        }
      } else {
        const result = await withStreamPaused(
          "🔴 Starting motion detection...",
          () => CameraAPI.startMotionDetection(),
        );

        if (result.success) {
          setStatus((prev) =>
            prev ? { ...prev, motion_detecting: true } : prev,
          );
          Alert.alert(
            "🎯 Motion Detection",
            "Started successfully. Will auto-record if motion is detected.",
          );
        } else {
          Alert.alert(
            "❌ Error",
            result.error || "Failed to start motion detection",
          );
        }
      }
    } catch (error: any) {
      Alert.alert("❌ Error", error.message);
    } finally {
      setLoading((prev) => ({ ...prev, motion: false }));
    }
  };

  return {
    loading,
    handleSnapshot,
    handleToggleRecording,
    handleToggleMotion,
  };
}
