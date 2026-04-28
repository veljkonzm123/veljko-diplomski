import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SettingsState, SettingsActions } from "../../types/settings";
import { SettingRow } from "./SettingRow";

interface Props {
  settings: SettingsState;
  updateSetting: SettingsActions["updateSetting"];
}

export function NotificationsSection({ settings, updateSetting }: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🔔 Notifications</Text>

      {/* Motion Alerts */}
      <SettingRow
        label="Motion Detection Alerts"
        description="Notify when motion is detected"
        value={settings.notifyMotion}
        onValueChange={(value) => updateSetting("notifyMotion", value)}
      />

      {/* Recording Alerts */}
      <SettingRow
        label="Recording Alerts"
        description="Notify when recording starts/stops"
        value={settings.notifyRecording}
        onValueChange={(value) => updateSetting("notifyRecording", value)}
      />

      {/* Storage Alerts */}
      <SettingRow
        label="Storage Alerts"
        description="Notify when storage is low"
        value={settings.notifyStorage}
        onValueChange={(value) => updateSetting("notifyStorage", value)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#14B8A6",
    marginBottom: 16,
  },
});
