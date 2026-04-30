import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { CameraStatus } from "../../api";
import { LoadingState } from "../../types/app";

interface Props {
  status: CameraStatus | null;
  loading: LoadingState;
  onSnapshot: () => void;
  onToggleRecording: () => void;
  onToggleMotion: () => void;
  onRefresh: () => void;
}

export function StreamControls({
  status,
  loading,
  onSnapshot,
  onToggleRecording,
  onToggleMotion,
  onRefresh,
}: Props) {
  const isRecording = status?.recording || false;
  const isMotionActive = status?.motion_detecting || false;
  const is247Active = status?.is_247_recording_active || false;

  return (
    <View style={styles.controls}>
      {/* Snapshot */}
      <TouchableOpacity
        style={[
          styles.controlButton,
          loading.snapshot && styles.buttonDisabled,
        ]}
        onPress={onSnapshot}
        disabled={loading.snapshot || loading.recording}
      >
        {loading.snapshot ? (
          <ActivityIndicator color="#4CAF50" size="small" />
        ) : (
          <>
            <Text style={styles.buttonIcon}>📷</Text>
            <Text style={styles.buttonText}>Snapshot</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Record */}
      <TouchableOpacity
        style={[
          styles.controlButton,
          isRecording && styles.recordingButton,
          (loading.recording || is247Active) && styles.buttonDisabled,
        ]}
        onPress={onToggleRecording}
        disabled={loading.recording || loading.snapshot || is247Active}
      >
        {loading.recording ? (
          <ActivityIndicator color="#f44336" size="small" />
        ) : (
          <>
            <Text style={styles.buttonIcon}>{isRecording ? "⏹" : "🔴"}</Text>
            <Text
              style={[
                styles.buttonText,
                isRecording && styles.buttonTextRecording,
              ]}
            >
              {isRecording ? "Stop" : "Record"}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Motion */}
      <TouchableOpacity
        style={[
          styles.controlButton,
          isMotionActive && styles.motionActiveButton,
          (loading.motion || is247Active) && styles.buttonDisabled,
        ]}
        onPress={onToggleMotion}
        disabled={loading.motion || is247Active}
      >
        {loading.motion ? (
          <ActivityIndicator color="#FF9800" size="small" />
        ) : (
          <>
            <Text style={styles.buttonIcon}>🎯</Text>
            <Text
              style={[
                styles.buttonText,
                isMotionActive && styles.buttonTextMotion,
              ]}
            >
              Motion
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Refresh */}
      <TouchableOpacity style={styles.controlButton} onPress={onRefresh}>
        <Text style={styles.buttonIcon}>🔄</Text>
        <Text style={styles.buttonText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
  },
  controlButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 70,
  },
  recordingButton: {
    backgroundColor: "rgba(244,67,54,0.15)",
    borderRadius: 12,
  },
  motionActiveButton: {
    backgroundColor: "rgba(255,152,0,0.15)",
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  buttonText: {
    color: "#AAB4C3",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  buttonTextRecording: {
    color: "#f44336",
  },
  buttonTextMotion: {
    color: "#FF9800",
  },
});
