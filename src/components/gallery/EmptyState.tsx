import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { GalleryTab } from "../../types/gallery";

interface Props {
  tab: GalleryTab;
}

export function EmptyState({ tab }: Props) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{tab === "photos" ? "📷" : "🎬"}</Text>
      <Text style={styles.emptyTitle}>
        No {tab === "photos" ? "snapshots" : "videos"} yet
      </Text>
      <Text style={styles.emptyText}>
        {tab === "photos"
          ? "Take a snapshot from the Live view"
          : "Start recording from the Live view"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#888",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  emptyText: {
    color: "#555",
    fontSize: 14,
    textAlign: "center",
  },
});
