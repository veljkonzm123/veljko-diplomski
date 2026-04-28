import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PUSH_TOKEN_KEY = "veljko-camera-push-token";
const NOTIFICATION_PREFS_KEY = "veljko-notification-prefs";

// ─── Default preferences ───
const DEFAULT_PREFS = {
  notifyMotion: true,
  notifyRecording: false,
  notifyStorage: true,
};
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});
// ─── Set up Android notification channel ───
const setupAndroidChannel = async () => {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("camera-alerts", {
      name: "Camera Alerts",
      description: "Motion detection and recording alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4CAF50",
      sound: "default",
      enableVibrate: true,
    });

    await Notifications.setNotificationChannelAsync("camera-recording", {
      name: "Recording Alerts",
      description: "Recording started and stopped alerts",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
  }
};

// ─── Request permissions ───
const requestNotificationPermissions = async (): Promise<boolean> => {
  if (!Device.isDevice) {
    console.log("[NOTIF] Not a real device, skipping permission request.");
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("[NOTIF] Permission not granted.");
    return false;
  }

  await setupAndroidChannel();
  console.log("[NOTIF] ✅ Permissions granted");
  return true;
};

// ─── FIRE a local notification immediately ───
// This is the core function. It creates a notification that appears
// on the device right now, triggered by our own app code.

export const showMotionNotification = async (): Promise<void> => {
  const prefs = await getNotificationPreferences();

  if (!prefs.notifyMotion) {
    console.log("[NOTIF] Motion notifications disabled by user.");
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🏃 Motion Detected!",
      body: `Movement detected at ${new Date().toLocaleTimeString()}`,
      data: { type: "motion_detected" },
      sound: "default",
      // Android specific
      categoryIdentifier: "camera-alerts",
      color: "#FF9800",
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: null, // null = show immediately
  });

  console.log("[NOTIF] 📳 Motion notification shown");
};

export const showRecordingStartedNotification = async (): Promise<void> => {
  const prefs = await getNotificationPreferences();

  if (!prefs.notifyRecording) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🔴 Recording Started",
      body: "Your camera has started recording.",
      data: { type: "recording_started" },
      sound: "default",
      color: "#F44336",
    },
    trigger: null,
  });
};

export const showRecordingStoppedNotification = async (
  duration: number,
  filename: string,
): Promise<void> => {
  const prefs = await getNotificationPreferences();

  if (!prefs.notifyRecording) return;

  const mins = Math.floor(duration / 60);
  const secs = Math.round(duration % 60);
  const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "⏹ Recording Saved",
      body: `Recording saved (${durationStr}): ${filename}`,
      data: { type: "recording_stopped", filename },
      sound: "default",
      color: "#4CAF50",
    },
    trigger: null,
  });
};

// ─── Save/Load notification preferences ───
export const saveNotificationPreferences = async (prefs: {
  notifyMotion: boolean;
  notifyRecording: boolean;
  notifyStorage: boolean;
}): Promise<void> => {
  await AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
  console.log("[NOTIF] Preferences saved:", prefs);
};

export const getNotificationPreferences = async (): Promise<{
  notifyMotion: boolean;
  notifyRecording: boolean;
  notifyStorage: boolean;
}> => {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (stored) {
      return { ...DEFAULT_PREFS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn("[NOTIF] Could not load preferences:", e);
  }
  return DEFAULT_PREFS;
};

// ─── Set up notification tap listeners ───
export const setupNotificationListeners = (
  onNotificationReceived: (notification: Notifications.Notification) => void,
  onNotificationTapped: (response: Notifications.NotificationResponse) => void,
) => {
  // Fired when notification arrives while app is OPEN
  const receivedListener = Notifications.addNotificationReceivedListener(
    onNotificationReceived,
  );

  // Fired when user TAPS a notification
  const responseListener =
    Notifications.addNotificationResponseReceivedListener(onNotificationTapped);

  return () => {
    receivedListener.remove();
    responseListener.remove();
  };
};

export const showStorageWarningNotification = async (
  usedPct: number,
  freeGB: number,
): Promise<void> => {
  const prefs = await getNotificationPreferences();

  if (!prefs.notifyStorage) {
    console.log("[NOTIF] Storage notifications disabled by user.");
    return;
  }

  console.log(
    `[NOTIF] Showing storage notification: ${usedPct}% used, ${freeGB}GB free`,
  );

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "⚠️ Storage Alert",
      body: `Storage ${usedPct.toFixed(1)}% full. Only ${freeGB.toFixed(1)} GB remaining.`,
      data: { type: "storage_warning", usedPct, freeGB },
      sound: "default",
      color: "#FF9800",
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: null, // null = show immediately
  });

  console.log("[NOTIF] 📳 Storage warning notification shown");
};

// ─── Clear badge count ───
export const clearBadge = async (): Promise<void> => {
  await Notifications.setBadgeCountAsync(0);
};

// ─── Initialize everything ───
export const initializeNotifications = async (): Promise<void> => {
  const granted = await requestNotificationPermissions();
  if (granted) {
    console.log("[NOTIF] ✅ Notification system initialized");
  } else {
    console.log("[NOTIF] ⚠️ Notifications not available");
  }
};

// Keep this as a no-op for API compatibility with Settings.tsx
// Now we use saveNotificationPreferences directly instead
export const updateNotificationPreferences = saveNotificationPreferences;