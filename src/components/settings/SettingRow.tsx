import React from "react";
import { View, Text, StyleSheet, Switch } from "react-native";

interface SettingRowProps {
  label: string;
  description: string;
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  children?: React.ReactNode;
}

export function SettingRow({
  label,
  description,
  value,
  onValueChange,
  children,
}: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      {onValueChange && (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: "#555", true: "#14B8A6" }}
          thumbColor={value ? "#fff" : "#ccc"}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
  },
  settingDescription: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
});
