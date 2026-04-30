import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraAPI, MotionConfig } from "../api";
import { updateNotificationPreferences } from "../services/notifications";
import { SettingsState, SettingsActions } from "../types/settings";

const SETTINGS_STORAGE_KEY = "veljko-camera-app-settings";

const DEFAULT_SETTINGS: SettingsState = {
  motionEnabled: false,
  motionSensitivity: 50,
  motionMinArea: 500,
  motionCooldown: 10,
  motionAutoRecord: true,
  is247RecordingEnabled: false,
  videoResolution: "720p",
  videoBitrate: 8000,
  videoFPS: 30,
  autoDeleteEnabled: false,
  autoDeleteDays: 7,
  maxStorageGB: 10,
  checkIntervalHours: 1.0,
  warningThresholdPct: 85.0,
  notifyMotion: true,
  notifyRecording: false,
  notifyStorage: true,
};

export function useSettings() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // Load camera status
      const statusResult = await CameraAPI.getStatus();
      const statusData = statusResult.data;

      if (statusResult.success && statusData) {
        setSettings((prev) => ({
          ...prev,
          is247RecordingEnabled: statusData.is_247_recording_active ?? false,
        }));
      }

      // Load storage config
      const storageResult = await CameraAPI.getStorageConfig();
      const storageConfig = storageResult.config;
      if (storageResult.success && storageConfig) {
        setSettings((prev) => ({
          ...prev,
          autoDeleteEnabled: storageConfig.auto_delete_enabled,
          autoDeleteDays: storageConfig.max_days,
          maxStorageGB: storageConfig.max_gb,
          checkIntervalHours: storageConfig.check_interval_hours || 1.0,
          warningThresholdPct: storageConfig.warning_threshold_pct || 85.0,
        }));
      }

      // Load motion config
      const motionResult = await CameraAPI.getMotionConfig();
      if (motionResult.success && motionResult.config) {
        const { sensitivity, min_area, cooldown, auto_record } =
          motionResult.config;
        const isCurrentlyDetecting = motionResult.state?.detecting ?? false;

        setSettings((prev) => ({
          ...prev,
          motionEnabled: isCurrentlyDetecting,
          motionSensitivity: sensitivity,
          motionMinArea: min_area,
          motionCooldown: cooldown,
          motionAutoRecord: auto_record,
        }));
      }

      // Load camera config
      const cameraResult = await CameraAPI.getCameraConfig();
      if (cameraResult.success && cameraResult.config) {
        const RESOLUTION_LABELS: Record<string, "480p" | "720p" | "1080p"> = {
          "854x480": "480p",
          "1280x720": "720p",
          "1920x1080": "1080p",
        };
        const resLabel =
          RESOLUTION_LABELS[cameraResult.config.resolution] ?? "720p";
        const bitrateKbps = Math.round(cameraResult.config.bitrate / 1000);

        setSettings((prev) => ({
          ...prev,
          videoResolution: resLabel,
          videoBitrate: bitrateKbps,
        }));
      }

      // Load local notification preferences
      const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const local = JSON.parse(stored);
        setSettings((prev) => ({
          ...prev,
          notifyMotion: local.notifyMotion ?? prev.notifyMotion,
          notifyRecording: local.notifyRecording ?? prev.notifyRecording,
          notifyStorage: local.notifyStorage ?? prev.notifyStorage,
        }));
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
      Alert.alert("Error", "Could not load settings from camera.");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      // 👇 Handle motion detection state FIRST
      const currentMotionStatus = await CameraAPI.getMotionConfig();
      const isCurrentlyDetecting =
        currentMotionStatus.state?.detecting ?? false;

      // Start or stop motion detection based on toggle
      if (settings.motionEnabled && !isCurrentlyDetecting) {
        console.log("[SETTINGS] Starting motion detection...");
        const startResult = await CameraAPI.startMotionDetection();
        if (!startResult.success) {
          Alert.alert(
            "❌ Error",
            startResult.error || "Failed to start motion detection",
          );
          // Revert the toggle
          setSettings((prev) => ({ ...prev, motionEnabled: false }));
          setSaving(false);
          return;
        }
      } else if (!settings.motionEnabled && isCurrentlyDetecting) {
        console.log("[SETTINGS] Stopping motion detection...");
        const stopResult = await CameraAPI.stopMotionDetection();
        if (!stopResult.success) {
          Alert.alert(
            "❌ Error",
            stopResult.error || "Failed to stop motion detection",
          );
          // Revert the toggle
          setSettings((prev) => ({ ...prev, motionEnabled: true }));
          setSaving(false);
          return;
        }
      }

      // Save motion config (sensitivity, min_area, etc.)
      const motionConfig: Partial<MotionConfig> = {
        sensitivity: settings.motionSensitivity,
        min_area: settings.motionMinArea,
        cooldown: settings.motionCooldown,
        auto_record: settings.motionAutoRecord,
      };
      await CameraAPI.updateMotionConfig(motionConfig);

      // Save storage config
      const storageResult = await CameraAPI.updateStorageConfig({
        auto_delete_enabled: settings.autoDeleteEnabled,
        max_days: settings.autoDeleteDays,
        max_gb: settings.maxStorageGB,
        check_interval_hours: settings.checkIntervalHours,
        warning_threshold_pct: settings.warningThresholdPct,
      });

      if (!storageResult.success) {
        Alert.alert(
          "❌ Error",
          storageResult.error || "Failed to save storage settings",
        );
        return;
      }

      // Save camera config
      const cameraResult = await CameraAPI.updateCameraConfig({
        resolution: settings.videoResolution,
        bitrate: settings.videoBitrate,
      });

      if (!cameraResult.success) {
        Alert.alert(
          "❌ Error",
          cameraResult.error || "Failed to save camera config",
        );
        return;
      }

      // Save notification preferences locally
      const clientSettings = {
        notifyMotion: settings.notifyMotion,
        notifyRecording: settings.notifyRecording,
        notifyStorage: settings.notifyStorage,
      };
      await AsyncStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(clientSettings),
      );
      await updateNotificationPreferences(clientSettings);

      Alert.alert("✅ Saved", "Settings updated successfully");
    } catch (error: any) {
      Alert.alert("❌ Error", error.message || "Failed to save settings");
      loadSettings(); // Re-sync on failure
    } finally {
      setSaving(false);
    }
  };

  const handle247RecordingToggle = async (value: boolean) => {
    setSettings((prev) => ({ ...prev, is247RecordingEnabled: value }));

    try {
      const result = value
        ? await CameraAPI.start247Recording()
        : await CameraAPI.stop247Recording();

      if (!result.success) {
        setSettings((prev) => ({ ...prev, is247RecordingEnabled: !value }));
        Alert.alert("❌ Error", result.error || "Operation failed");
      } else {
        Alert.alert(
          "✅ Success",
          value
            ? "24/7 recording mode has been activated."
            : "24/7 recording mode has been deactivated.",
        );
      }
    } catch (error: any) {
      setSettings((prev) => ({ ...prev, is247RecordingEnabled: !value }));
      Alert.alert("❌ Error", error.message);
    }
  };

  const updateSetting = <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return {
    settings,
    loading,
    saving,
    updateSetting,
    saveSettings,
    loadSettings,
    handle247RecordingToggle,
  };
}
