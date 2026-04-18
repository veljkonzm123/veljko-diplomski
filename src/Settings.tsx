import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import Slider from "@react-native-community/slider";
import { CameraAPI, MotionConfig } from "./api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { updateNotificationPreferences } from "../src/services/notifications";
const SETTINGS_STORAGE_KEY = "veljko-camera-app-settings";

interface SettingsState {
  // Motion Detection
  motionEnabled: boolean;
  motionSensitivity: number;
  motionMinArea: number;
  motionCooldown: number;
  motionAutoRecord: boolean;
  is247RecordingEnabled: boolean;

  // Video Quality
  videoResolution: "720p" | "1080p" | "480p";
  videoBitrate: number;
  videoFPS: number;

  // Storage
  autoDeleteEnabled: boolean;
  autoDeleteDays: number;
  maxStorageGB: number;

  // Notifications
  notifyMotion: boolean;
  notifyRecording: boolean;
  notifyStorage: boolean;
}
export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>({
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

    notifyMotion: true,
    notifyRecording: false,
    notifyStorage: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const statusResult = await CameraAPI.getStatus();
      const statusData = statusResult.data;

      if (statusResult.success && statusData) {
        setSettings((prev) => ({
          ...prev,
          is247RecordingEnabled: statusData.is_247_recording_active ?? false,
        }));
      }

      const storageResult = await CameraAPI.getStorageConfig();
      const storageConfig = storageResult.config;
      if (storageResult.success && storageConfig) {
        setSettings((prev) => ({
          ...prev,
          autoDeleteEnabled: storageConfig.auto_delete_enabled,
          autoDeleteDays: storageConfig.max_days,
          maxStorageGB: storageConfig.max_gb,
        }));
      }
      // ── Motion config (server-side) ──────────────────────────────
      const motionResult = await CameraAPI.getMotionConfig();

      // Guard: only apply if both success AND config are present
      if (motionResult.success && motionResult.config) {
        // Destructure AFTER the guard so TypeScript knows it's defined
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

      const cameraResult = await CameraAPI.getCameraConfig();
      if (cameraResult.success && cameraResult.config) {
        // Backend returns "1280x720", we need to convert to "720p"
        const RESOLUTION_LABELS: Record<string, "480p" | "720p" | "1080p"> = {
          "854x480": "480p",
          "1280x720": "720p",
          "1920x1080": "1080p",
        };
        const resLabel =
          RESOLUTION_LABELS[cameraResult.config.resolution] ?? "720p";

        // Backend returns bitrate in bps, we store in Kbps for the slider
        const bitrateKbps = Math.round(cameraResult.config.bitrate / 1000);

        setSettings((prev) => ({
          ...prev,
          videoResolution: resLabel,
          videoBitrate: bitrateKbps,
        }));
      }

      const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const local = JSON.parse(stored);
        setSettings((prev) => ({
          ...prev,
          // Only apply notification keys from local storage!
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
      // 1. Optimistically update the local state for the switch
      // This provides instant feedback to the user.
      setSettings((prev) => ({
        ...prev,
        motionEnabled: settings.motionEnabled,
      }));

      const storageResult = await CameraAPI.updateStorageConfig({
        auto_delete_enabled: settings.autoDeleteEnabled,
        max_days: settings.autoDeleteDays,
        max_gb: settings.maxStorageGB,
      });

      if (!storageResult.success) {
        Alert.alert(
          "❌ Error",
          storageResult.error || "Failed to save storage settings",
        );
        return;
      }

      // 2. Save server-side settings to backend
      const motionIsEnabled = settings.motionEnabled;
      const currentMotionStatus = await CameraAPI.getMotionConfig();

      if (motionIsEnabled && !currentMotionStatus.state?.detecting) {
        await CameraAPI.startMotionDetection();
      } else if (!motionIsEnabled && currentMotionStatus.state?.detecting) {
        await CameraAPI.stopMotionDetection();
      }

      const motionConfig: Partial<MotionConfig> = {
        sensitivity: settings.motionSensitivity,
        min_area: settings.motionMinArea,
        cooldown: settings.motionCooldown,
        auto_record: settings.motionAutoRecord,
      };
      await CameraAPI.updateMotionConfig(motionConfig);

      const cameraResult = await CameraAPI.updateCameraConfig({
        resolution: settings.videoResolution, // "480p" | "720p" | "1080p"
        bitrate: settings.videoBitrate, // in Kbps
      });
      if (!cameraResult.success) {
        Alert.alert(
          "❌ Error",
          cameraResult.error || "Failed to save camera config",
        );
        return;
      }

      // 3. Save client-side settings (no change here)
      const clientSettings = {
        notifyMotion: settings.notifyMotion,
        notifyRecording: settings.notifyRecording,
        notifyStorage: settings.notifyStorage,
      };
      await AsyncStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(clientSettings),
      );

      await updateNotificationPreferences({
        notifyMotion: settings.notifyMotion,
        notifyRecording: settings.notifyRecording,
        notifyStorage: settings.notifyStorage,
      });

      Alert.alert("✅ Saved", "Settings updated successfully");
    } catch (error: any) {
      Alert.alert("❌ Error", error.message || "Failed to save settings");
      // If an error occurs, we should refresh the state to get the true value
      loadSettings(); // Re-sync with the server on failure
    } finally {
      setSaving(false);
    }
  };

  const handle247RecordingToggle = async (value: boolean) => {
    // Optimistically update the UI
    setSettings((prev) => ({ ...prev, is247RecordingEnabled: value }));

    try {
      const result = value
        ? await CameraAPI.start247Recording()
        : await CameraAPI.stop247Recording();

      if (!result.success) {
        // On failure, revert the UI and show an alert
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
      // Also revert on network errors
      setSettings((prev) => ({ ...prev, is247RecordingEnabled: !value }));
      Alert.alert("❌ Error", error.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      {/* ========== CONTINUOUS RECORDING ========== */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🕒 Continuous Recording</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Enable 24/7 Recording</Text>
            <Text style={styles.settingDescription}>
              Automatically records 24h segments. This will override manual and
              motion recording.
            </Text>
          </View>
          <Switch
            value={settings.is247RecordingEnabled}
            onValueChange={handle247RecordingToggle}
            trackColor={{ false: "#555", true: "#f44336" }} // Use red to indicate it's a major mode
            thumbColor={settings.is247RecordingEnabled ? "#fff" : "#ccc"}
          />
        </View>
      </View>
      {/* ========== MOTION DETECTION ========== */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}> Motion Detection</Text>

        {/* Enable/Disable */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Enable Motion Detection</Text>
            <Text style={styles.settingDescription}>
              Automatically detect movement
            </Text>
          </View>
          <Switch
            value={settings.motionEnabled}
            onValueChange={(value) =>
              setSettings({ ...settings, motionEnabled: value })
            }
            trackColor={{ false: "#555", true: "#4CAF50" }}
            thumbColor={settings.motionEnabled ? "#fff" : "#ccc"}
          />
        </View>

        {/* Sensitivity */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>
              Sensitivity: {settings.motionSensitivity}%
            </Text>
            <Text style={styles.settingDescription}>
              Higher = more sensitive
            </Text>
          </View>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={100}
          step={5}
          value={settings.motionSensitivity}
          onValueChange={(value) =>
            setSettings({ ...settings, motionSensitivity: value })
          }
          minimumTrackTintColor="#4CAF50"
          maximumTrackTintColor="#555"
          thumbTintColor="#4CAF50"
        />

        {/* Minimum Area */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>
              Min Area: {settings.motionMinArea} px
            </Text>
            <Text style={styles.settingDescription}>
              Minimum changed pixels to trigger
            </Text>
          </View>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={100}
          maximumValue={5000}
          step={100}
          value={settings.motionMinArea}
          onValueChange={(value) =>
            setSettings({ ...settings, motionMinArea: value })
          }
          minimumTrackTintColor="#4CAF50"
          maximumTrackTintColor="#555"
          thumbTintColor="#4CAF50"
        />

        {/* Cooldown */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>
              Cooldown: {settings.motionCooldown}s
            </Text>
            <Text style={styles.settingDescription}>
              Time between detections
            </Text>
          </View>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={60}
          step={1}
          value={settings.motionCooldown}
          onValueChange={(value) =>
            setSettings({ ...settings, motionCooldown: value })
          }
          minimumTrackTintColor="#4CAF50"
          maximumTrackTintColor="#555"
          thumbTintColor="#4CAF50"
        />

        {/* Auto-Record */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Auto-Record on Motion</Text>
            <Text style={styles.settingDescription}>
              Start recording when motion detected
            </Text>
          </View>
          <Switch
            value={settings.motionAutoRecord}
            onValueChange={(value) =>
              setSettings({ ...settings, motionAutoRecord: value })
            }
            trackColor={{ false: "#555", true: "#4CAF50" }}
            thumbColor={settings.motionAutoRecord ? "#fff" : "#ccc"}
          />
        </View>
      </View>

      {/* ========== VIDEO QUALITY ========== */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}> Video Quality</Text>

        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            ⚠️ Changing resolution will briefly restart the camera stream. Stop
            any active recording before saving.
          </Text>
        </View>

        {/* Resolution */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Resolution</Text>
        </View>
        <View style={styles.buttonGroup}>
          {(["480p", "720p", "1080p"] as const).map((res) => (
            <TouchableOpacity
              key={res}
              style={[
                styles.optionButton,
                settings.videoResolution === res && styles.optionButtonActive,
              ]}
              onPress={() => setSettings({ ...settings, videoResolution: res })}
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

        {/* Bitrate */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>
              Bitrate: {(settings.videoBitrate / 1000).toFixed(1)} Mbps
            </Text>
            <Text style={styles.settingDescription}>
              Higher = better quality
            </Text>
          </View>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={2000}
          maximumValue={20000}
          step={1000}
          value={settings.videoBitrate}
          onValueChange={(value) =>
            setSettings({ ...settings, videoBitrate: value })
          }
          minimumTrackTintColor="#4CAF50"
          maximumTrackTintColor="#555"
          thumbTintColor="#4CAF50"
        />

        {/* FPS */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>
              Frame Rate: {settings.videoFPS} FPS
            </Text>
            <Text style={styles.settingDescription}>
              Higher = smoother motion
            </Text>
          </View>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={15}
          maximumValue={60}
          step={5}
          value={settings.videoFPS}
          onValueChange={(value) =>
            setSettings({ ...settings, videoFPS: value })
          }
          minimumTrackTintColor="#4CAF50"
          maximumTrackTintColor="#555"
          thumbTintColor="#4CAF50"
        />
      </View>

      {/* ========== STORAGE MANAGEMENT ========== */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}> Storage Management</Text>

        {/* Auto-Delete */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Auto-Delete Old Files</Text>
            <Text style={styles.settingDescription}>
              Automatically remove old recordings
            </Text>
          </View>
          <Switch
            value={settings.autoDeleteEnabled}
            onValueChange={(value) =>
              setSettings({ ...settings, autoDeleteEnabled: value })
            }
            trackColor={{ false: "#555", true: "#4CAF50" }}
            thumbColor={settings.autoDeleteEnabled ? "#fff" : "#ccc"}
          />
        </View>

        {/* Delete After Days */}
        {settings.autoDeleteEnabled && (
          <>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>
                  Delete After: {settings.autoDeleteDays} days
                </Text>
                <Text style={styles.settingDescription}>
                  Files older than this will be deleted
                </Text>
              </View>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={60}
              step={1}
              value={settings.autoDeleteDays}
              onValueChange={(value) =>
                setSettings({ ...settings, autoDeleteDays: value })
              }
              minimumTrackTintColor="#4CAF50"
              maximumTrackTintColor="#555"
              thumbTintColor="#4CAF50"
            />
          </>
        )}

        {/* Max Storage */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>
              {/* 👇 New, clearer label */}
              Reserve Free Space: {settings.maxStorageGB} GB
            </Text>
            <Text style={styles.settingDescription}>
              {/* 👇 New, clearer description */}
              Always keep at least this much space free on the SD card.
            </Text>
          </View>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={50}
          step={1}
          value={settings.maxStorageGB}
          onValueChange={(value) =>
            setSettings({ ...settings, maxStorageGB: value })
          }
          minimumTrackTintColor="#4CAF50"
          maximumTrackTintColor="#555"
          thumbTintColor="#4CAF50"
        />
      </View>

      {/* ========== NOTIFICATIONS ========== */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}> Notifications</Text>

        {/* Motion Alerts */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Motion Detection Alerts</Text>
            <Text style={styles.settingDescription}>
              Notify when motion is detected
            </Text>
          </View>
          <Switch
            value={settings.notifyMotion}
            onValueChange={(value) =>
              setSettings({ ...settings, notifyMotion: value })
            }
            trackColor={{ false: "#555", true: "#4CAF50" }}
            thumbColor={settings.notifyMotion ? "#fff" : "#ccc"}
          />
        </View>

        {/* Storage Alerts */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Storage Alerts</Text>
            <Text style={styles.settingDescription}>
              Notify when storage is low
            </Text>
          </View>
          <Switch
            value={settings.notifyStorage}
            onValueChange={(value) =>
              setSettings({ ...settings, notifyStorage: value })
            }
            trackColor={{ false: "#555", true: "#4CAF50" }}
            thumbColor={settings.notifyStorage ? "#fff" : "#ccc"}
          />
        </View>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={saveSettings}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}> Save Settings</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
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
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
  },
  section: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4CAF50",
    marginBottom: 16,
  },
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
    backgroundColor: "#4CAF50",
    borderColor: "#4CAF50",
  },
  optionButtonText: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
  },
  optionButtonTextActive: {
    color: "#fff",
  },
  saveButton: {
    backgroundColor: "#4CAF50",
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
});