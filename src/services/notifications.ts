// notifications.ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../config";

// Key for storing push token locally
const PUSH_TOKEN_KEY = "veljko-camera-push-token";

// How notifications appear when app is in the FOREGROUND
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── Register device and get push token ───
export const registerForPushNotifications = async (): Promise<
  string | null
> => {
  // Push notifications only work on real devices
  if (!Device.isDevice) {
    console.log("[NOTIF] Push notifications require a real device.");
    return null;
  }

  // Check/request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    Alert.alert(
      "🔔 Notifications Disabled",
      "Enable notifications in your phone settings to receive motion alerts.",
      [{ text: "OK" }],
    );
    return null;
  }

  // Android needs a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("camera-alerts", {
      name: "Camera Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4CAF50",
      sound: "default",
    });
  }

  // Get the Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });

    console.log("[NOTIF] Push token:", token.data);

    // Save the token locally
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token.data);

    // Send the token to your Pi so it knows where to send alerts
    await sendTokenToPi(token.data);

    return token.data;
  } catch (error) {
    console.error("[NOTIF] Failed to get push token:", error);
    return null;
  }
};

// ─── Send push token to the Pi ───
const sendTokenToPi = async (token: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      console.log("[NOTIF] ✅ Token registered with Pi");
    } else {
      console.warn("[NOTIF] ⚠️ Failed to register token with Pi");
    }
  } catch (error) {
    // Pi might be offline, that's OK - we'll retry on next app open
    console.warn("[NOTIF] Could not reach Pi to register token:", error);
  }
};

export const updateNotificationPreferences = async (prefs: {
  notifyMotion: boolean;
  notifyRecording: boolean;
  notifyStorage: boolean;
}): Promise<void> => {
  try {
    const token = await getStoredPushToken();
    if (!token) return;

    await fetch(`${API_BASE_URL}/api/push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, preferences: prefs }),
    });
    console.log("[NOTIF] Preferences updated on Pi");
  } catch (error) {
    console.warn("[NOTIF] Could not update preferences:", error);
  }
};

// ─── Get stored push token ───
export const getStoredPushToken = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
};

// ─── Set up notification response listeners ───
export const setupNotificationListeners = (
  onNotificationReceived: (notification: Notifications.Notification) => void,
  onNotificationTapped: (response: Notifications.NotificationResponse) => void,
) => {
  // Fired when a notification is received while the app IS open
  const receivedListener = Notifications.addNotificationReceivedListener(
    onNotificationReceived,
  );

  // Fired when the user TAPS a notification
  const responseListener =
    Notifications.addNotificationResponseReceivedListener(onNotificationTapped);

  // Return a cleanup function to call on unmount
  return () => {
    receivedListener.remove();
    responseListener.remove();
  };
};
