import React from "react";
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";

interface Props {
  visible: boolean;
  streamHTML: string;
  retryKey: number;
  streamPaused: boolean;
  pauseReason: string;
  onClose: () => void;
}

export function FullscreenModal({
  visible,
  streamHTML,
  retryKey,
  streamPaused,
  pauseReason,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.fullscreenContainer}>
        <StatusBar hidden />

        <View style={styles.fullscreenStreamWrapper}>
          {streamPaused ? (
            <View style={styles.overlayCenter}>
              <ActivityIndicator size="large" color="#FFC107" />
              <Text style={styles.overlayText}>{pauseReason}</Text>
            </View>
          ) : (
            <WebView
              key={`fullscreen-${retryKey}`}
              source={{ html: streamHTML }}
              style={styles.fullscreenWebview}
              javaScriptEnabled
              domStorageEnabled
              scalesPageToFit
              bounces={false}
              scrollEnabled={false}
            />
          )}

          <TouchableOpacity
            style={styles.exitFullscreenButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.exitFullscreenIcon}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  overlayText: {
    color: "#888",
    marginTop: 16,
    fontSize: 14,
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
