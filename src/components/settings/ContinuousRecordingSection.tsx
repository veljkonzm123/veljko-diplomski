import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SettingsState } from "../../types/settings";
import { SettingRow } from "./SettingRow";

interface Props {
  settings: SettingsState;
  onToggle: (value: boolean) => Promise<void>;
}

export function ContinuousRecordingSection({ settings, onToggle }: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🕒 Continuous Recording</Text>

      <SettingRow
        label="Enable 24/7 Recording"
        description="Automatically records 24h segments. This will override manual and motion recording."
        value={settings.is247RecordingEnabled}
        onValueChange={onToggle}
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
