import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SettingsState, SettingsActions } from "../../types/settings";
import { SettingRow } from "./SettingRow";
import { SettingSlider } from "./SettingSlider";

interface Props {
  settings: SettingsState;
  updateSetting: SettingsActions["updateSetting"];
}

export function MotionDetectionSection({ settings, updateSetting }: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🏃 Motion Detection</Text>

      {/* Enable/Disable */}
      <SettingRow
        label="Enable Motion Detection"
        description="Automatically detect movement"
        value={settings.motionEnabled}
        onValueChange={(value) => updateSetting("motionEnabled", value)}
      />

      {/* Sensitivity */}
      <SettingSlider
        label="Sensitivity"
        description="Higher = more sensitive"
        value={settings.motionSensitivity}
        minimumValue={0}
        maximumValue={100}
        step={5}
        onValueChange={(value) => updateSetting("motionSensitivity", value)}
        formatValue={(value) => `${value}%`}
      />

      {/* Minimum Area */}
      <SettingSlider
        label="Min Area"
        description="Minimum changed pixels to trigger"
        value={settings.motionMinArea}
        minimumValue={100}
        maximumValue={5000}
        step={100}
        onValueChange={(value) => updateSetting("motionMinArea", value)}
        formatValue={(value) => `${value} px`}
      />

      {/* Cooldown */}
      <SettingSlider
        label="Cooldown"
        description="Time between detections"
        value={settings.motionCooldown}
        minimumValue={1}
        maximumValue={60}
        step={1}
        onValueChange={(value) => updateSetting("motionCooldown", value)}
        formatValue={(value) => `${value}s`}
      />

      {/* Auto-Record */}
      <SettingRow
        label="Auto-Record on Motion"
        description="Start recording when motion detected"
        value={settings.motionAutoRecord}
        onValueChange={(value) => updateSetting("motionAutoRecord", value)}
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
