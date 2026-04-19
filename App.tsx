import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  StatusBar,
  Vibration,
  AppState,
  AppStateStatus,
  LogBox,
} from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";

import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { STREAM_URL, CAMERA_IP } from "./src/config";
import { Ionicons } from "@expo/vector-icons";
import {
  CameraAPI,
  CameraStatus,
  StatusMessage,
  MotionMessage,
  RecordingMessage,
  StorageMessage,
} from "./src/api";
import Gallery from "./src/Gallery";
import Settings from "./src/Settings";
import {
  initializeNotifications,
  setupNotificationListeners,
  clearBadge,
} from "./src/services/notifications";
import { mqttService, TOPICS } from "./src/services/mqtt";
LogBox.ignoreLogs([
  "expo-notifications: Android Push notifications",
  "`expo-notifications` functionality is not fully supported in Expo Go",
]);
export default function App() {
  // ─── Tab navigation ───
  const [activeTab, setActiveTab] = useState<"live" | "gallery" | "settings">(
    "live",
  );

  // ─── Live view state ───
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [streamPaused, setStreamPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [mqttConnected, setMqttConnected] = useState(false);
  const [motionLoading, setMotionLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const apiInProgress = useRef(false);

  // ========== NEW: MQTT INTEGRATION ==========

  useEffect(() => {
    // Connect to MQTT on mount
    console.log("[APP] Connecting to MQTT...");
    mqttService.connect(CAMERA_IP);

    // Listen for MQTT messages
    const unsubMessage = mqttService.onMessage((topic, message) => {
      console.log("[MQTT FRONTEND] topic:", topic);
      console.log("[MQTT FRONTEND] message:", message);
      // Status updates (replaces polling when connected)
      if (topic === TOPICS.STATUS) {
        const msg = message as StatusMessage;
        setStatus({
          initialized: msg.initialized,
          streaming: msg.streaming,
          recording: msg.recording,
          recording_duration: msg.recording_duration,
          current_video: msg.current_video,
          resolution: msg.resolution,
          motion_detecting: msg.motion_detecting,
        });
      }

      // Motion alerts
      if (topic === TOPICS.MOTION) {
        console.log("[MOTION] MQTT message received:", message);

        const msg = message as MotionMessage;

        Vibration.vibrate(500);

        Alert.alert(
          "🚨 Motion Detected!",
          `Confidence: ${msg.confidence.toFixed(1)}%\nSnapshot: ${msg.snapshot}`,
          [{ text: "OK" }],
        );
      }

      if (topic === TOPICS.STORAGE) {
        console.log("[STORAGE] MQTT message received:", message);
        const msg = message as StorageMessage;

        if (msg.type === "storage_warning") {
          Vibration.vibrate([0, 200, 100, 200]);
          console.log(
            `[STORAGE] Warning triggered: ${msg.used_pct}% used, ${msg.free_gb}GB free`,
          );
        }
      }

      // Recording events
      if (topic === TOPICS.RECORDING) {
        const msg = message as RecordingMessage;
        if (msg.type === "recording_started") {
          Alert.alert("🔴 Recording Started", `File: ${msg.filename}`);
        } else if (msg.type === "recording_stopped") {
          Alert.alert(
            "⏹ Recording Stopped",
            `Duration: ${msg.duration?.toFixed(1)}s`,
          );
        }
      }

      // Snapshot events
      if (topic === TOPICS.SNAPSHOT) {
        const msg = message as any;
        if (msg.type === "snapshot_taken") {
          Alert.alert("📷 Snapshot Saved", `File: ${msg.filename}`);
        }
      }
    });

    // Listen for MQTT connection status
    const unsubConnection = mqttService.onConnectionChange((connected) => {
      setMqttConnected(connected);
      console.log(`[MQTT] ${connected ? "Connected" : "Disconnected"}`);
    });

    // Cleanup
    return () => {
      unsubMessage();
      unsubConnection();
      mqttService.disconnect();
    };
  }, []);

  useEffect(() => {
    // 1. Initialize local notification system (request permissions, set up channels)
    initializeNotifications();

    // 2. Listen for when user TAPS a notification to navigate
    const cleanup = setupNotificationListeners(
      // Notification received while app is OPEN - already handled by MQTT Alert
      // so we just log it here to avoid double alerts
      (notification) => {
        console.log(
          "[APP] Local notification received while open:",
          notification.request.content.title,
        );
      },
      // User TAPPED a notification while app was in background
      (response) => {
        const data = response.notification.request.content.data;
        console.log("[APP] Notification tapped:", data);

        if (data?.type === "motion_detected") {
          // Navigate to gallery to see the motion snapshot
          setActiveTab("gallery");
        } else if (
          data?.type === "recording_stopped" ||
          data?.type === "recording_started"
        ) {
          // Navigate to gallery to see the new recording
          setActiveTab("gallery");
        }
      },
    );

    // 3. Clear badge count when app comes to foreground
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") {
          clearBadge();
        }
      },
    );

    return () => {
      cleanup();
      appStateSubscription.remove();
    };
  }, []);
  // ========== HTTP Polling (only as fallback when MQTT not connected) ==========

  const fetchStatus = async () => {
    if (apiInProgress.current) return;
    if (activeTab !== "live") return;
    if (mqttConnected) return; // ← Skip polling when MQTT is connected

    const result = await CameraAPI.getStatus();
    if (result.success && result.data) {
      setStatus(result.data);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Slower polling (5s instead of 3s)
    return () => clearInterval(interval);
  }, [activeTab, mqttConnected]);

  const withStreamPaused = async <T,>(
    reason: string,
    apiCall: () => Promise<T>,
  ): Promise<T> => {
    apiInProgress.current = true;
    setPauseReason(reason);
    setStreamPaused(true);
    await new Promise((resolve) => setTimeout(resolve, 600));

    try {
      return await apiCall();
    } finally {
      setStreamPaused(false);
      setPauseReason("");
      setRetryKey((prev) => prev + 1);
      setIsLoading(true);
      apiInProgress.current = false;
    }
  };

  const handleLoadEnd = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const retryConnection = () => {
    setIsLoading(true);
    setHasError(false);
    setStreamPaused(false);
    setRetryKey((prev) => prev + 1);
  };

  const handleSnapshot = async () => {
    setSnapshotLoading(true);
    try {
      const result = await withStreamPaused("📷 Taking snapshot...", () =>
        CameraAPI.takeSnapshot(),
      );
      if (result.success) {
        // Alert removed - MQTT will notify
        console.log("✅ Snapshot taken");
      } else {
        Alert.alert("❌ Failed", result.error || "Unknown error");
      }
    } catch (error: any) {
      Alert.alert("❌ Error", error.message);
    } finally {
      setSnapshotLoading(false);
    }
  };

  const handleToggleRecording = async () => {
    const isCurrentlyRecording = status?.recording || false;
    setRecordingLoading(true);

    try {
      if (isCurrentlyRecording) {
        // Stop recording
        const result = await withStreamPaused("⏹ Stopping recording...", () =>
          CameraAPI.stopRecording(),
        );

        if (result.success) {
          // Update state immediately
          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  recording: false,
                  recording_duration: 0,
                  current_video: null,
                }
              : prev,
          );

          const duration = result.data?.duration?.toFixed(1) || "0";
          const sizeKB = ((result.data?.size || 0) / 1024).toFixed(1);
          Alert.alert(
            "⏹ Stopped",
            `Duration: ${duration}s\nSize: ${sizeKB} KB`,
            [{ text: "OK" }],
          );
        } else {
          Alert.alert("❌ Failed", result.error || "Unknown error");
        }
      } else {
        // Start recording
        const result = await withStreamPaused("🔴 Starting recording...", () =>
          CameraAPI.startRecording(),
        );

        if (result.success) {
          // Update state immediately
          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  recording: true,
                  recording_duration: 0,
                  current_video: result.filename || null,
                }
              : prev,
          );

          Alert.alert("🔴 Recording", `File: ${result.filename}`, [
            { text: "OK" },
          ]);
        } else {
          Alert.alert("❌ Failed", result.error || "Unknown error");
        }
      }
    } catch (error: any) {
      Alert.alert("❌ Error", error.message);
    } finally {
      setRecordingLoading(false);
    }
  };

  const handleToggleMotion = async () => {
    const isCurrentlyDetecting = status?.motion_detecting || false;
    setMotionLoading(true);

    try {
      if (isCurrentlyDetecting) {
        // ⏹ Stop Motion Detection
        const result = await withStreamPaused(
          "⏹ Stopping motion detection...", // Reason for pause overlay
          () => CameraAPI.stopMotionDetection(),
        );

        if (result.success) {
          // Optimistic update
          setStatus((prev) =>
            prev ? { ...prev, motion_detecting: false } : prev,
          );
          Alert.alert("🎯 Motion Detection", "Stopped successfully");
        } else {
          Alert.alert(
            "❌ Error",
            result.error || "Failed to stop motion detection",
          );
        }
      } else {
        // 🔴 Start Motion Detection
        const result = await withStreamPaused(
          "🔴 Starting motion detection...", // Reason for pause overlay
          () => CameraAPI.startMotionDetection(),
        );

        if (result.success) {
          // Optimistic update
          setStatus((prev) =>
            prev ? { ...prev, motion_detecting: true } : prev,
          );
          Alert.alert(
            "🎯 Motion Detection",
            "Started successfully. Will auto-record if motion is detected.",
          );
        } else {
          Alert.alert(
            "❌ Error",
            result.error || "Failed to start motion detection",
          );
        }
      }
    } catch (error: any) {
      Alert.alert("❌ Error", error.message);
    } finally {
      setMotionLoading(false);
    }
  };
  const enterFullscreen = async () => {
    try {
      // Lock to landscape
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      );
      setIsFullscreen(true);
    } catch (error) {
      console.error("Failed to enter fullscreen:", error);
    }
  };

  const exitFullscreen = async () => {
    try {
      // Unlock orientation (allow portrait)
      await ScreenOrientation.unlockAsync();
      setIsFullscreen(false);
    } catch (error) {
      console.error("Failed to exit fullscreen:", error);
    }
  };

  const streamHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow: hidden; }
          img { width: 100%; height: 100%; object-fit: contain; }
        </style>
      </head>
      <body>
        <img src="${STREAM_URL}" alt="Camera Stream" />
      </body>
    </html>
  `;

  const isRecording = status?.recording || false;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.mainContainer}>
          {activeTab === "live" && !isFullscreen && (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Header with MQTT indicator */}
              {!isFullscreen && (
                <View style={styles.header}>
                  <View style={styles.headerTopRow}>
                    {/* Leva strana (naslov + subtitle) */}
                    <View style={styles.headerTextContainer}>
                      <Text style={styles.title}>Camera System</Text>
                    </View>

                    {/* Desno - SETTINGS */}
                    <TouchableOpacity
                      style={styles.settingsButton}
                      onPress={() => setShowSettings(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="settings-outline"
                        size={22}
                        color="#14B8A6"
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Status */}
                  <View style={styles.statusRow}>
                    <View style={styles.statusPill}>
                      <Text style={styles.ip}>IP: {CAMERA_IP}</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Stream  */}
              <View
                style={[
                  styles.streamWrapper,
                  isRecording && styles.streamWrapperRecording,
                ]}
              >
                {isLoading && (
                  <View style={styles.overlayCenter}>
                    <ActivityIndicator size="large" color="#4CAF50" />
                    <Text style={styles.overlayText}>
                      Connecting to camera...
                    </Text>
                  </View>
                )}

                {hasError && (
                  <View style={styles.overlayCenter}>
                    <Text style={styles.errorIcon}>📡</Text>
                    <Text style={styles.errorTitle}>Connection Failed</Text>
                    <Text style={styles.errorText}>
                      Cannot connect to camera{"\n"}Check if RPi is online
                    </Text>
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={retryConnection}
                    >
                      <Text style={styles.retryButtonText}>🔄 Retry</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {!streamPaused ? (
                  <WebView
                    key={retryKey}
                    ref={webViewRef}
                    source={{ html: streamHTML }}
                    style={styles.webview}
                    onLoadEnd={handleLoadEnd}
                    onError={handleError}
                    onHttpError={handleError}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    startInLoadingState={false}
                    scalesPageToFit={true}
                    bounces={false}
                    scrollEnabled={false}
                  />
                ) : (
                  <View style={styles.overlayCenter}>
                    <ActivityIndicator size="large" color="#FFC107" />
                    <Text style={styles.overlayText}>{pauseReason}</Text>
                  </View>
                )}

                {!isLoading && !hasError && !streamPaused && (
                  <View style={styles.liveIndicator}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                )}

                {isRecording && !streamPaused && (
                  <View style={styles.recordingIndicator}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingText}>REC</Text>
                  </View>
                )}
                {!isLoading && !hasError && !streamPaused && (
                  <TouchableOpacity
                    style={styles.fullscreenButton}
                    onPress={enterFullscreen}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.fullscreenIcon}>⛶</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Controls - same as before */}
              <View style={styles.controls}>
                {/* Snapshot Button */}
                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    snapshotLoading && styles.buttonDisabled,
                  ]}
                  onPress={handleSnapshot}
                  disabled={snapshotLoading || recordingLoading}
                >
                  {snapshotLoading ? (
                    <ActivityIndicator color="#4CAF50" size="small" />
                  ) : (
                    <>
                      <Text style={styles.buttonIcon}>📷</Text>
                      <Text style={styles.buttonText}>Snapshot</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Record Button */}
                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    isRecording && styles.recordingButton,
                    recordingLoading && styles.buttonDisabled,
                  ]}
                  onPress={handleToggleRecording}
                  disabled={recordingLoading || snapshotLoading}
                >
                  {recordingLoading ? (
                    <ActivityIndicator color="#f44336" size="small" />
                  ) : (
                    <>
                      <Text style={styles.buttonIcon}>
                        {isRecording ? "⏹" : "🔴"}
                      </Text>
                      <Text
                        style={[
                          styles.buttonText,
                          isRecording && styles.buttonTextRecording,
                        ]}
                      >
                        {isRecording ? "Stop" : "Record"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Motion Detection Button */}
                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    status?.motion_detecting && styles.motionActiveButton,
                    motionLoading && styles.buttonDisabled,
                  ]}
                  onPress={handleToggleMotion}
                  disabled={motionLoading}
                >
                  {motionLoading ? (
                    <ActivityIndicator color="#FF9800" size="small" />
                  ) : (
                    <>
                      <Text style={styles.buttonIcon}>🎯</Text>
                      <Text
                        style={[
                          styles.buttonText,
                          status?.motion_detecting && styles.buttonTextMotion,
                        ]}
                      >
                        Motion
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Refresh Button */}
                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={retryConnection}
                >
                  <Text style={styles.buttonIcon}>🔄</Text>
                  <Text style={styles.buttonText}>Refresh</Text>
                </TouchableOpacity>
              </View>

              {/* Status Card - same as before */}
              {status && (
                <View style={styles.statusCard}>
                  <Text style={styles.statusTitle}> Camera Status</Text>
                  <View style={styles.statusGrid}>
                    <View style={styles.statusItem}>
                      <Text style={styles.statusLabel}>Camera</Text>
                      <Text
                        style={[
                          styles.statusValue,
                          { color: status.initialized ? "#14B8A6" : "#f44336" },
                        ]}
                      >
                        {status.initialized ? "✅ Online" : "❌ Offline"}
                      </Text>
                    </View>

                    <View style={styles.statusItem}>
                      <Text style={styles.statusLabel}>Motion</Text>
                      <Text
                        style={[
                          styles.statusValue,
                          {
                            color: status.motion_detecting ? "#FF9800" : "#888",
                          },
                        ]}
                      >
                        {status.motion_detecting ? "🎯 Active" : "⚪ Off"}
                      </Text>
                    </View>
                    <View style={styles.statusItem}>
                      <Text style={styles.statusLabel}>Streaming</Text>
                      <Text
                        style={[
                          styles.statusValue,
                          { color: status.streaming ? "#14B8A6" : "#888" },
                        ]}
                      >
                        {status.streaming ? "✅ Active" : "⚪ Inactive"}
                      </Text>
                    </View>
                    <View style={styles.statusItem}>
                      <Text style={styles.statusLabel}>Recording</Text>
                      <Text
                        style={[
                          styles.statusValue,
                          { color: status.recording ? "#f44336" : "#888" },
                        ]}
                      >
                        {status.recording ? "🔴 Recording" : "⚪ Idle"}
                      </Text>
                    </View>
                    <View style={styles.statusItem}>
                      <Text style={styles.statusLabel}>Resolution</Text>
                      <Text style={styles.statusValue}>
                        {status.resolution}
                      </Text>
                    </View>
                  </View>
                  {status.recording && status.current_video && (
                    <View style={styles.recordingInfo}>
                      <Text style={styles.recordingInfoText}>
                        📁 {status.current_video}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          )}

          {activeTab === "gallery" && <Gallery />}

          <Modal
            visible={isFullscreen}
            animationType="fade"
            onRequestClose={exitFullscreen}
          >
            <View style={styles.fullscreenContainer}>
              {/* Hide status bar in fullscreen */}
              <StatusBar hidden />

              {/* Fullscreen Stream */}
              <View style={styles.fullscreenStreamWrapper}>
                {!streamPaused ? (
                  <WebView
                    key={`fullscreen-${retryKey}`}
                    source={{ html: streamHTML }}
                    style={styles.fullscreenWebview}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    scalesPageToFit={true}
                    bounces={false}
                    scrollEnabled={false}
                  />
                ) : (
                  <View style={styles.overlayCenter}>
                    <ActivityIndicator size="large" color="#FFC107" />
                    <Text style={styles.overlayText}>{pauseReason}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.exitFullscreenButton}
                  onPress={exitFullscreen}
                  activeOpacity={0.7}
                >
                  <Text style={styles.exitFullscreenIcon}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "live" && styles.tabActive]}
              onPress={() => setActiveTab("live")}
            >
              <Text
                style={[
                  styles.tabIcon,
                  activeTab === "live" && styles.tabIconActive,
                ]}
              >
                📹
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "live" && styles.tabLabelActive,
                ]}
              >
                Live
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === "gallery" && styles.tabActive]}
              onPress={() => setActiveTab("gallery")}
            >
              <Text
                style={[
                  styles.tabIcon,
                  activeTab === "gallery" && styles.tabIconActive,
                ]}
              >
                🗂️
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "gallery" && styles.tabLabelActive,
                ]}
              >
                Gallery
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <Modal
          visible={showSettings}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setShowSettings(false)}
        >
          <SafeAreaView style={styles.settingsModalContainer}>
            <View style={styles.settingsModalHeader}>
              <Text style={styles.settingsModalTitle}>Settings</Text>
              <TouchableOpacity
                onPress={() => setShowSettings(false)}
                style={styles.settingsCloseButton}
              >
                <Text style={styles.settingsCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Settings />
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0f0f1e" },
  mainContainer: { flex: 1, backgroundColor: "#0f0f1e" },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 10 },

  // Header
  header: { marginBottom: 20 },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#14B8A6", // ← 🌊 Changed from #4CAF50
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ip: {
    fontSize: 13,
    color: "#ffffff",
  },

  // Stream
  streamWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    borderColor: "#14B8A6", // ← 🌊 Changed from #4CAF50
  },
  streamWrapperRecording: { borderColor: "#FF453A" }, // Keep red for recording
  webview: { flex: 1, backgroundColor: "#000" },

  overlayCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0f0f1e",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  overlayText: { color: "#888", marginTop: 16, fontSize: 14 },
  errorIcon: { fontSize: 64, marginBottom: 16 },
  errorTitle: {
    color: "#FF453A",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  errorText: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: "#14B8A6", // ← 🌊 Changed from #4CAF50
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },

  liveIndicator: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 50,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#32D74B", // ← Keep green for "LIVE" (universal meaning)
    marginRight: 8,
  },
  liveText: { color: "white", fontSize: 12, fontWeight: "bold" },

  recordingIndicator: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(244,67,54,0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 50,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "white",
    marginRight: 8,
  },
  recordingText: { color: "white", fontSize: 12, fontWeight: "bold" },

  // Controls (Icon Bar Minimal)
  controls: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
  },

  controlButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 70,
  },

  controlButtonActive: {
    backgroundColor: "rgba(20,184,166,0.15)", // ← 🌊 Teal with opacity
    borderRadius: 12,
  },

  recordingButton: {
    backgroundColor: "rgba(244,67,54,0.15)", // Keep red for recording
    borderRadius: 12,
  },

  motionActiveButton: {
    backgroundColor: "rgba(255,152,0,0.15)", // Keep orange for motion
    borderRadius: 12,
  },

  buttonDisabled: {
    opacity: 0.4,
  },

  buttonIcon: {
    fontSize: 28,
    marginBottom: 6,
  },

  buttonText: {
    color: "#AAB4C3",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },

  buttonTextActive: {
    color: "#14B8A6", // ← 🌊 Changed from #4CAF50
  },

  buttonTextRecording: {
    color: "#f44336", // Keep red
  },

  buttonTextMotion: {
    color: "#FF9800", // Keep orange
  },

  // Status Card
  statusCard: {
    marginTop: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 16,
    borderRadius: 12,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#14B8A6", // ← 🌊 Changed from #4CAF50
    marginBottom: 12,
  },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statusItem: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "rgba(0,0,0,0.3)",
    padding: 12,
    borderRadius: 8,
  },
  statusLabel: { fontSize: 11, color: "#888", marginBottom: 4 },
  statusValue: { fontSize: 14, fontWeight: "600", color: "#888" },
  recordingInfo: {
    marginTop: 12,
    backgroundColor: "rgba(244,67,54,0.2)",
    padding: 10,
    borderRadius: 8,
  },
  recordingInfoText: { color: "#f44336", fontSize: 12, fontWeight: "500" },

  // Bottom Tab Bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
  },
  tabActive: {
    borderTopWidth: 2,
    borderTopColor: "#14B8A6", // ← 🌊 Changed from #4CAF50
  },
  tabIcon: {
    fontSize: 22,
    marginBottom: 2,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  tabLabelActive: {
    color: "#14B8A6", // ← 🌊 Changed from #4CAF50
  },

  // Header
  headerTextContainer: {
    flex: 1,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#AAB4C3",
    marginTop: 4,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1F2A3D",
    justifyContent: "center",
    alignItems: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A2233",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },

  // Settings Modal
  settingsModalContainer: {
    flex: 1,
    backgroundColor: "#101624",
  },
  settingsModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#263248",
    backgroundColor: "#101624",
  },
  settingsModalTitle: {
    color: "white",
    fontSize: 22,
    fontWeight: "700",
  },
  settingsCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1F2A3D",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsCloseButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },

  // Fullscreen
  fullscreenButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  fullscreenIcon: {
    fontSize: 24,
    color: "#fff",
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  fullscreenStreamWrapper: {
    flex: 1,
    position: "relative",
  },
  fullscreenWebview: {
    flex: 1,
    backgroundColor: "#000",
  },
  exitFullscreenButton: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 50,
    height: 50,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.4)",
    zIndex: 100,
  },
  exitFullscreenIcon: {
    fontSize: 28,
    color: "#fff",
    fontWeight: "bold",
  },
});
