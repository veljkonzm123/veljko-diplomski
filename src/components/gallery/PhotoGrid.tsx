import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { FileInfo, CameraAPI } from "../../api";
import {
  GRID_COLUMNS,
  GRID_SPACING,
  THUMB_SIZE,
} from "../../constants/gallery";
import { formatTime, formatFileSize } from "../../utils/formatters";

interface Props {
  row: FileInfo[];
  onPress: (file: FileInfo) => void;
}

export function PhotoGrid({ row, onPress }: Props) {
  return (
    <View style={styles.gridRow}>
      {row.map((file) => (
        <TouchableOpacity
          key={file.filename}
          style={styles.gridItem}
          onPress={() => onPress(file)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: CameraAPI.getSnapshotUrl(file.filename) }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
          <View style={styles.gridItemInfo}>
            <Text style={styles.gridItemTime}>{formatTime(file.created)}</Text>
            <Text style={styles.gridItemSize}>{formatFileSize(file.size)}</Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* Fill empty cells */}
      {row.length < GRID_COLUMNS &&
        Array.from({ length: GRID_COLUMNS - row.length }).map((_, i) => (
          <View key={`empty-${i}`} style={styles.gridItemPlaceholder} />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gridRow: {
    flexDirection: "row",
    gap: GRID_SPACING,
    marginBottom: GRID_SPACING,
  },
  gridItem: {
    width: THUMB_SIZE,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    overflow: "hidden",
  },
  gridItemPlaceholder: {
    width: THUMB_SIZE,
  },
  thumbnail: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    backgroundColor: "#1a1a2e",
  },
  gridItemInfo: {
    padding: 6,
  },
  gridItemTime: {
    color: "#ccc",
    fontSize: 11,
    fontWeight: "600",
  },
  gridItemSize: {
    color: "#666",
    fontSize: 10,
    marginTop: 2,
  },
});
