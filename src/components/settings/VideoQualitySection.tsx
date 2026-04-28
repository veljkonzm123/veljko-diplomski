import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SettingsState, SettingsActions } from "../../types/settings";
import { SettingSlider } from "./SettingSlider";

interface Props {
  settings: SettingsState;
  updateSetting: SettingsActions["updateSetting"];
}

export function VideoQualitySection({ settings, updateSetting }: Props) {
  const resolutionOptions: Array<"480p" | "720p" | "1080p"> = [
    "480p",
    "720p",
    "1080p",
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🎥 Video Quality</Text>

      {/* Warning Banner */}
      <View style={styles.warningBanner}>
        <Text style={styles.warningText}>
          ⚠️ Changing resolution will briefly restart the camera stream. Stop
          any active recording before saving.
        </Text>
      </View>

      {/* Resolution Selector */}
      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Resolution</Text>
      </View>
      <View style={styles.buttonGroup}>
        {resolutionOptions.map((res) => (
          <TouchableOpacity
            key={res}
            style={[
              styles.optionButton,
              settings.videoResolution === res && styles.optionButtonActive,
            ]}
            onPress={() => updateSetting("videoResolution", res)}
          >
            <Text
              style={[
                styles.optionButtonText,
                settings.videoResolution === res &&
                  styles.optionButtonTextActive,
              ]}
            >
              {res}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bitrate Slider */}
      <SettingSlider
        label="Bitrate"
        description="Higher = better quality"
        value={settings.videoBitrate}
        minimumValue={2000}
        maximumValue={20000}
        step={1000}
        onValueChange={(value) => updateSetting("videoBitrate", value)}
        formatValue={(value) => `${(value / 1000).toFixed(1)} Mbps`}
      />

      {/* FPS Slider */}
      <SettingSlider
        label="Frame Rate"
        description="Higher = smoother motion"
        value={settings.videoFPS}
        minimumValue={15}
        maximumValue={60}
        step={5}
        onValueChange={(value) => updateSetting("videoFPS", value)}
        formatValue={(value) => `${value} FPS`}
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
  warningBanner: {
    backgroundColor: "rgba(255, 152, 0, 0.15)",
    borderLeftWidth: 3,
    borderLeftColor: "#FF9800",
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
  },
  warningText: {
    color: "#FF9800",
    fontSize: 13,
    lineHeight: 18,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
  },
  buttonGroup: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  optionButtonActive: {
    backgroundColor: "#14B8A6",
    borderColor: "#14B8A6",
  },
  optionButtonText: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
  },
  optionButtonTextActive: {
    color: "#fff",
  },
});
