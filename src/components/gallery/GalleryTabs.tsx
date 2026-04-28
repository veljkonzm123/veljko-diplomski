import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { GalleryTab } from "../../types/gallery";

interface Props {
  activeTab: GalleryTab;
  photoCount: number;
  videoCount: number;
  onTabChange: (tab: GalleryTab) => void;
}

export function GalleryTabs({
  activeTab,
  photoCount,
  videoCount,
  onTabChange,
}: Props) {
  return (
    <View style={styles.subTabs}>
      <TouchableOpacity
        style={[styles.subTab, activeTab === "photos" && styles.subTabActive]}
        onPress={() => onTabChange("photos")}
      >
        <Text
          style={[
            styles.subTabText,
            activeTab === "photos" && styles.subTabTextActive,
          ]}
        >
          Photos ({photoCount})
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.subTab, activeTab === "videos" && styles.subTabActive]}
        onPress={() => onTabChange("videos")}
      >
        <Text
          style={[
            styles.subTabText,
            activeTab === "videos" && styles.subTabTextActive,
          ]}
        >
          Videos ({videoCount})
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  subTabs: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
  },
  subTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  subTabActive: {
    backgroundColor: "#14B8A6",
  },
  subTabText: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
  },
  subTabTextActive: {
    color: "white",
  },
});
