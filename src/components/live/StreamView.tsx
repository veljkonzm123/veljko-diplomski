import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import { StreamState } from "../../types/app";

interface Props {
  streamHTML: string;
  retryKey: number;
  state: StreamState;
  isRecording: boolean;
  webViewRef: React.RefObject<WebView | null>;
  onLoadEnd: () => void;
  onError: () => void;
  onRetry: () => void;
  onFullscreen: () => void;
}

export function StreamView({
  streamHTML,
  retryKey,
  state,
  isRecording,
  webViewRef,
  onLoadEnd,
  onError,
  onRetry,
  onFullscreen,
}: Props) {
  return (
    <View
      style={[
        styles.streamWrapper,
        isRecording && styles.streamWrapperRecording,
      ]}
    >
      {/* Loading Overlay */}
      {state.isLoading && (
        <View style={styles.overlayCenter}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.overlayText}>Connecting to camera...</Text>
        </View>
      )}

      {/* Error Overlay */}
      {state.hasError && (
        <View style={styles.overlayCenter}>
          <Text style={styles.errorIcon}>📡</Text>
          <Text style={styles.errorTitle}>Connection Failed</Text>
          <Text style={styles.errorText}>
            Cannot connect to camera{"\n"}Check if RPi is online
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>🔄 Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Stream Paused Overlay */}
      {state.streamPaused ? (
        <View style={styles.overlayCenter}>
          <ActivityIndicator size="large" color="#FFC107" />
          <Text style={styles.overlayText}>{state.pauseReason}</Text>
        </View>
      ) : (
        <WebView
          key={retryKey}
          ref={webViewRef}
          source={{ html: streamHTML }}
          style={styles.webview}
          onLoadEnd={onLoadEnd}
          onError={onError}
          onHttpError={onError}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          scalesPageToFit
          bounces={false}
          scrollEnabled={false}
        />
      )}

      {/* Live Indicator */}
      {!state.isLoading && !state.hasError && !state.streamPaused && (
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}

      {/* Recording Indicator */}
      {isRecording && !state.streamPaused && (
        <View style={styles.recordingIndicator}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>REC</Text>
        </View>
      )}

      {/* Fullscreen Button */}
      {!state.isLoading && !state.hasError && !state.streamPaused && (
        <TouchableOpacity
          style={styles.fullscreenButton}
          onPress={onFullscreen}
          activeOpacity={0.7}
        >
          <Text style={styles.fullscreenIcon}>⛶</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  streamWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    borderColor: "#14B8A6",
  },
  streamWrapperRecording: {
    borderColor: "#FF453A",
  },
  webview: {
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
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
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
    backgroundColor: "#14B8A6",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
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
    backgroundColor: "#32D74B",
    marginRight: 8,
  },
  liveText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
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
  recordingText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
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
});
