import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  LogBox,
  AppState,
  AppStateStatus,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CAMERA_IP } from "./src/config";
import { TabName, NotificationData } from "./src/types/app";
import { useMqttIntegration } from "./src/hooks/useMqttIntegration";
import {
  initializeNotifications,
  setupNotificationListeners,
  clearBadge,
} from "./src/services/notifications";
import { TabBar } from "./src/components/navigation/TabBar";
import LiveScreen from "./src/screens/LiveScreen";
import Gallery from "./src/screens/Gallery";
import { CameraStatus } from "./src/api";

LogBox.ignoreLogs([
  "expo-notifications: Android Push notifications",
  "`expo-notifications` functionality is not fully supported in Expo Go",
]);

export default function App() {
  const [activeTab, setActiveTab] = useState<TabName>("live");
  // 👇 THIS status state will be shared with LiveScreen
  const [status, setStatus] = useState<CameraStatus | null>(null);

  const { mqttConnected } = useMqttIntegration({
    cameraIp: CAMERA_IP,
    setStatus, // 👈 MQTT updates this state
  });

  // Notification setup
  useEffect(() => {
    initializeNotifications();

    const cleanup = setupNotificationListeners(
      (notification) => {
        console.log(
          "[APP] Notification received:",
          notification.request.content.title,
        );
      },
      (response) => {
        const data = response.notification.request.content
          .data as NotificationData;

        if (
          data?.type === "motion_detected" ||
          data?.type?.includes("recording")
        ) {
          setActiveTab("gallery");
        }
      },
    );

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

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        {/* 👇 Pass status and setStatus as props */}
        {activeTab === "live" && (
          <LiveScreen
            mqttConnected={mqttConnected}
            status={status}
            setStatus={setStatus}
          />
        )}
        {activeTab === "gallery" && <Gallery />}

        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1e",
  },
});
