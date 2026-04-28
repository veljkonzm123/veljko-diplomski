import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Slider from "@react-native-community/slider";

interface SettingSliderProps {
  label: string;
  description: string;
  value: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  onValueChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

export function SettingSlider({
  label,
  description,
  value,
  minimumValue,
  maximumValue,
  step,
  onValueChange,
  formatValue,
}: SettingSliderProps) {
  const displayValue = formatValue ? formatValue(value) : value.toString();

  return (
    <>
      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>
            {label}: {displayValue}
          </Text>
          <Text style={styles.settingDescription}>{description}</Text>
        </View>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor="#14B8A6"
        maximumTrackTintColor="#555"
        thumbTintColor="#14B8A6"
      />
    </>
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
  slider: {
    width: "100%",
    height: 40,
    marginBottom: 12,
  },
});
