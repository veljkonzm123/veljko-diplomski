import React, { useEffect } from "react";
import { View, StyleSheet, ScrollView, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraAPI, CameraStatus } from "../api";
import { STREAM_URL, CAMERA_IP } from "../config";
import { generateStreamHTML } from "../utils/streamHelpers";
import { useLiveStream } from "../hooks/useLiveStream";
import { useCameraControls } from "../hooks/useCameraControls";
import { useFullscreen } from "../hooks/useFullscreen";
import {
  LiveHeader,
  StreamView,
  StreamControls,
  StatusCard,
  InfoBanner,
  FullscreenModal,
} from "../components/live";
import Settings from "./Settings";

interface Props {
  mqttConnected: boolean;
  // 👇 Accept status and setStatus as props
  status: CameraStatus | null;
  setStatus: React.Dispatch<React.SetStateAction<CameraStatus | null>>;
}

export default function LiveScreen({
  mqttConnected,
  status,
  setStatus,
}: Props) {
  const [showSettings, setShowSettings] = React.useState(false);

  const streamLogic = useLiveStream();
  const { isFullscreen, enterFullscreen, exitFullscreen } = useFullscreen();

  const controls = useCameraControls({
    status,
    setStatus,
    withStreamPaused: streamLogic.withStreamPaused,
  });

  // HTTP Polling (fallback when MQTT not connected)
  const fetchStatus = async () => {
    if (streamLogic.apiInProgress.current) return;
    if (mqttConnected) return; // Skip if MQTT is handling updates

    const result = await CameraAPI.getStatus();
    if (result.success && result.data) {
      setStatus(result.data);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [mqttConnected]);

  const streamHTML = generateStreamHTML(STREAM_URL);

  return (
    <SafeAreaView style={styles.container}>
      {!isFullscreen && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <LiveHeader
            cameraIp={CAMERA_IP}
            onSettingsPress={() => setShowSettings(true)}
          />

          <StreamView
            streamHTML={streamHTML}
            retryKey={streamLogic.state.retryKey}
            state={streamLogic.state}
            isRecording={status?.recording || false}
            webViewRef={streamLogic.webViewRef}
            onLoadEnd={streamLogic.handleLoadEnd}
            onError={streamLogic.handleError}
            onRetry={streamLogic.retryConnection}
            onFullscreen={enterFullscreen}
          />

          <StreamControls
            status={status}
            loading={controls.loading}
            onSnapshot={controls.handleSnapshot}
            onToggleRecording={controls.handleToggleRecording}
            onToggleMotion={controls.handleToggleMotion}
            onRefresh={streamLogic.retryConnection}
          />

          {/* 👇 Show info banner when 24/7 is active */}
          {status?.is_247_recording_active && <InfoBanner />}

          {/* 👇 Show status card when status exists */}
          {status && <StatusCard status={status} />}
        </ScrollView>
      )}

      <FullscreenModal
        visible={isFullscreen}
        streamHTML={streamHTML}
        retryKey={streamLogic.state.retryKey}
        streamPaused={streamLogic.state.streamPaused}
        pauseReason={streamLogic.state.pauseReason}
        onClose={exitFullscreen}
      />

      <Modal
        visible={showSettings}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowSettings(false)}
      >
        <SafeAreaView style={styles.settingsModalContainer}>
          <Settings onClose={() => setShowSettings(false)} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1e",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 10,
  },
  settingsModalContainer: {
    flex: 1,
    backgroundColor: "#101624",
  },
});
