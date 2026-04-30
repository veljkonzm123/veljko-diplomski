import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  cameraIp: string;
  onSettingsPress: () => void;
}

export function LiveHeader({ cameraIp, onSettingsPress }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Veljko Camera</Text>
        </View>

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={onSettingsPress}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={22} color="#14B8A6" />
        </TouchableOpacity>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusPill}>
          <Text style={styles.ip}>IP: {cameraIp}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 20,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#14B8A6",
    marginBottom: 8,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1F2A3D",
    justifyContent: "center",
    alignItems: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A2233",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  ip: {
    fontSize: 13,
    color: "#ffffff",
  },
});
