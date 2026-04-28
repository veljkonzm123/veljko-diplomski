import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  photoCount: number;
  videoCount: number;
}

export function GalleryHeader({ photoCount, videoCount }: Props) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Gallery</Text>
      <Text style={styles.subtitle}>
        {photoCount} photos • {videoCount} videos
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#14B8A6",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
  },
});
