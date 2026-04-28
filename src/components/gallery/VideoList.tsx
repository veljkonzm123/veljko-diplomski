import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { FileInfo } from "../../api";
import { formatTime, formatFileSize } from "../../utils/formatters";

interface Props {
  row: FileInfo[];
  onPress: (file: FileInfo) => void;
  onDelete: (file: FileInfo) => void;
}

export function VideoList({ row, onPress, onDelete }: Props) {
  const file = row[0];
  const isMotionVideo = file.filename.startsWith("mot_");

  const icon = isMotionVideo ? "🚨" : "🎥";
  const typeLabel = isMotionVideo ? "Motion" : "Manual";
  const iconBgColor = isMotionVideo
    ? "rgba(168, 33, 15, 0.74)"
    : "rgba(22, 85, 33, 0.2)";

  return (
    <TouchableOpacity
      style={styles.videoItem}
      onPress={() => onPress(file)}
      activeOpacity={0.7}
    >
      <View style={[styles.videoIcon, { backgroundColor: iconBgColor }]}>
        <Text style={styles.videoIconText}>{icon}</Text>
      </View>

      <View style={styles.videoInfo}>
        <Text style={styles.videoFilename} numberOfLines={1}>
          {file.filename}
        </Text>
        <Text style={styles.videoMeta}>
          {formatFileSize(file.size)} • {formatTime(file.created)} • {typeLabel}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => onDelete(file)}
      >
        <Text style={styles.deleteButtonText}>🗑️</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  videoItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  videoIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  videoIconText: {
    fontSize: 24,
  },
  videoInfo: {
    flex: 1,
  },
  videoFilename: {
    color: "#ddd",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  videoMeta: {
    color: "#888",
    fontSize: 12,
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButtonText: {
    fontSize: 18,
  },
});
