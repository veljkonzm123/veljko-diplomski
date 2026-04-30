import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { CameraStatus } from "../../api";

interface Props {
  status: CameraStatus;
}

export function StatusCard({ status }: Props) {
  return (
    <View style={styles.statusCard}>
      <Text style={styles.statusTitle}>📊 Camera Status</Text>
      <View style={styles.statusGrid}>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Camera</Text>
          <Text
            style={[
              styles.statusValue,
              { color: status.initialized ? "#14B8A6" : "#f44336" },
            ]}
          >
            {status.initialized ? "✅ Online" : "❌ Offline"}
          </Text>
        </View>

        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Motion</Text>
          <Text
            style={[
              styles.statusValue,
              { color: status.motion_detecting ? "#FF9800" : "#888" },
            ]}
          >
            {status.motion_detecting ? "🎯 Active" : "⚪ Off"}
          </Text>
        </View>

        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Streaming</Text>
          <Text
            style={[
              styles.statusValue,
              { color: status.streaming ? "#14B8A6" : "#888" },
            ]}
          >
            {status.streaming ? "✅ Active" : "⚪ Inactive"}
          </Text>
        </View>

        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Recording</Text>
          <Text
            style={[
              styles.statusValue,
              { color: status.recording ? "#f44336" : "#888" },
            ]}
          >
            {status.recording ? "🔴 Recording" : "⚪ Idle"}
          </Text>
        </View>

        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Resolution</Text>
          <Text style={styles.statusValue}>{status.resolution}</Text>
        </View>
      </View>

      {status.recording && status.current_video && (
        <View style={styles.recordingInfo}>
          <Text style={styles.recordingInfoText}>
            📁 {status.current_video}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    marginTop: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 16,
    borderRadius: 12,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#14B8A6",
    marginBottom: 12,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusItem: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "rgba(0,0,0,0.3)",
    padding: 12,
    borderRadius: 8,
  },
  statusLabel: {
    fontSize: 11,
    color: "#888",
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
  },
  recordingInfo: {
    marginTop: 12,
    backgroundColor: "rgba(244,67,54,0.2)",
    padding: 10,
    borderRadius: 8,
  },
  recordingInfoText: {
    color: "#f44336",
    fontSize: 12,
    fontWeight: "500",
  },
});
