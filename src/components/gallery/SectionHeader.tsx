import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { GallerySection } from "../../types/gallery";

interface Props {
  section: GallerySection;
}

export function SectionHeader({ section }: Props) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionDay}>{section.subtitle}</Text>
      <Text style={styles.sectionMonth}>{section.title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 10,
    backgroundColor: "#0f0f1a",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(76,175,80,0.2)",
    marginBottom: 8,
  },
  sectionDay: {
    fontSize: 16,
    fontWeight: "700",
    color: "#e0e0e0",
  },
  sectionMonth: {
    fontSize: 12,
    color: "#14B8A6",
    fontWeight: "600",
  },
});
