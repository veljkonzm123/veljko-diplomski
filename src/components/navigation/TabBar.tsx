import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { TabName } from "../../types/app";

interface Props {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
}

export function TabBar({ activeTab, onTabChange }: Props) {
  return (
    <View style={styles.tabBar}>
      <TouchableOpacity
        style={[styles.tab, activeTab === "live" && styles.tabActive]}
        onPress={() => onTabChange("live")}
      >
        <Text
          style={[styles.tabIcon, activeTab === "live" && styles.tabIconActive]}
        >
          📹
        </Text>
        <Text
          style={[
            styles.tabLabel,
            activeTab === "live" && styles.tabLabelActive,
          ]}
        >
          Live
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tab, activeTab === "gallery" && styles.tabActive]}
        onPress={() => onTabChange("gallery")}
      >
        <Text
          style={[
            styles.tabIcon,
            activeTab === "gallery" && styles.tabIconActive,
          ]}
        >
          🗂️
        </Text>
        <Text
          style={[
            styles.tabLabel,
            activeTab === "gallery" && styles.tabLabelActive,
          ]}
        >
          Gallery
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
  },
  tabActive: {
    borderTopWidth: 2,
    borderTopColor: "#14B8A6",
  },
  tabIcon: {
    fontSize: 22,
    marginBottom: 2,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  tabLabelActive: {
    color: "#14B8A6",
  },
});
