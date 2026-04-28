import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SettingsState, SettingsActions } from "../../types/settings";
import { SettingRow } from "./SettingRow";
import { SettingSlider } from "./SettingSlider";

interface Props {
  settings: SettingsState;
  updateSetting: SettingsActions["updateSetting"];
}

export function StorageSection({ settings, updateSetting }: Props) {
  // Format check interval for display
  const formatCheckInterval = (hours: number): string => {
    if (hours < 1) {
      return `${Math.round(hours * 60)} min`;
    }
    return `${hours.toFixed(1)} hours`;
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>💾 Storage Management</Text>

      {/* Auto-Delete Toggle */}
      <SettingRow
        label="Auto-Delete Old Files"
        description="Automatically remove old recordings"
        value={settings.autoDeleteEnabled}
        onValueChange={(value) => updateSetting("autoDeleteEnabled", value)}
      />

      {/* Delete After Days - Only show if auto-delete is enabled */}
      {settings.autoDeleteEnabled && (
        <SettingSlider
          label="Delete After"
          description="Files older than this will be deleted"
          value={settings.autoDeleteDays}
          minimumValue={1}
          maximumValue={60}
          step={1}
          onValueChange={(value) => updateSetting("autoDeleteDays", value)}
          formatValue={(value) => `${value} days`}
        />
      )}

      {/* Max Storage GB */}
      <SettingSlider
        label="Reserve Free Space"
        description="Always keep at least this much space free on the SD card"
        value={settings.maxStorageGB}
        minimumValue={1}
        maximumValue={50}
        step={1}
        onValueChange={(value) => updateSetting("maxStorageGB", value)}
        formatValue={(value) => `${value} GB`}
      />

      {/* Check Interval */}
      <SettingSlider
        label="Check Interval"
        description="How often to check storage and cleanup old files"
        value={settings.checkIntervalHours}
        minimumValue={0.033} // 2 minutes
        maximumValue={24}
        step={0.05}
        onValueChange={(value) => updateSetting("checkIntervalHours", value)}
        formatValue={formatCheckInterval}
      />

      {/* Warning Threshold */}
      <SettingSlider
        label="Warning Threshold"
        description="Send alert when storage usage reaches this percentage"
        value={settings.warningThresholdPct}
        minimumValue={10}
        maximumValue={95}
        step={5}
        onValueChange={(value) => updateSetting("warningThresholdPct", value)}
        formatValue={(value) => `${value.toFixed(0)}%`}
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
