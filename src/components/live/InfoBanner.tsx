import React from "react";
import { View, Text, StyleSheet } from "react-native";

export function InfoBanner() {
  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoIcon}>ℹ️</Text>
      <Text style={styles.infoText}>
        Manual recording and motion detection are disabled during 24/7 recording
        mode. Go to Settings to stop continuous recording.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(255, 152, 0, 0.1)",
    borderLeftWidth: 3,
    borderLeftColor: "#FF9800",
    borderRadius: 8,
  },
  infoIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#FF9800",
    lineHeight: 18,
  },
});
