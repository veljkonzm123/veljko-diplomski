import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Text,
} from "react-native";
import { useSettings } from "../hooks/useSettings";
import {
  MotionDetectionSection,
  VideoQualitySection,
  StorageSection,
  NotificationsSection,
  ContinuousRecordingSection,
} from "../components/settings";

interface Props {
  onClose?: () => void; // Optional, for when opened in modal
}

export default function Settings({ onClose }: Props) {
  const {
    settings,
    loading,
    saving,
    updateSetting,
    saveSettings,
    handle247RecordingToggle,
  } = useSettings();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#14B8A6" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <>
      {/* 👇 Add header with close button if onClose is provided */}
      {onClose && (
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Settings</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <ContinuousRecordingSection
          settings={settings}
          onToggle={handle247RecordingToggle}
        />

        <MotionDetectionSection
          settings={settings}
          updateSetting={updateSetting}
        />

        <VideoQualitySection
          settings={settings}
          updateSetting={updateSetting}
        />

        <StorageSection settings={settings} updateSetting={updateSetting} />

        <NotificationsSection
          settings={settings}
          updateSetting={updateSetting}
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={saveSettings}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>💾 Save Settings</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  content: {
    padding: 20,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
  },
  loadingText: {
    color: "#888",
    marginTop: 10,
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: "#14B8A6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  // 👇 New styles for modal header
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#263248",
    backgroundColor: "#1a1a2e",
  },
  modalTitle: {
    color: "white",
    fontSize: 22,
    fontWeight: "700",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1F2A3D",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
});
