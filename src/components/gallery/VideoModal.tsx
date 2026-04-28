import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import { WebView } from "react-native-webview";
import { FileInfo, CameraAPI } from "../../api";
import { formatDate, formatFileSize } from "../../utils/formatters";

interface Props {
  file: FileInfo | null;
  onClose: () => void;
  onDelete: (file: FileInfo) => void;
}

export function VideoModal({ file, onClose, onDelete }: Props) {
  if (!file) return null;

  const videoUrl = CameraAPI.getVideoUrl(file.path || file.filename);

  const videoHTML = `
    <!DOCTYPE html><html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:#000; display:flex; justify-content:center; align-items:center; min-height:100vh; }
        video { width:100%; max-height:100vh; object-fit:contain; }
        .error { color:#f44336; text-align:center; padding:20px; font-family:sans-serif; }
      </style>
    </head>
    <body>
      <video src="${videoUrl}" controls autoplay playsinline
        onerror="document.body.innerHTML='<div class=error><h2>Cannot play</h2><p>File may still be converting to MP4</p></div>'">
      </video>
    </body></html>`;

  return (
    <Modal
      visible
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.modalTitle} numberOfLines={1}>
            {file.filename}
          </Text>

          <TouchableOpacity
            style={[
              styles.modalActionButton,
              { backgroundColor: "rgba(244,67,54,0.3)" },
            ]}
            onPress={() => onDelete(file)}
          >
            <Text style={{ fontSize: 18 }}>🗑️</Text>
          </TouchableOpacity>
        </View>

        {/* Video Player */}
        <View style={styles.videoPlayerContainer}>
          <WebView
            source={{ html: videoHTML }}
            style={styles.videoPlayer}
            javaScriptEnabled
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
          />
        </View>

        {/* Info */}
        <View style={styles.modalInfoBar}>
          <Text style={styles.modalInfoText}>
            {formatDate(file.created)} • {formatFileSize(file.size)}
          </Text>
          {file.date_path && (
            <Text style={styles.modalInfoPath}>📁 {file.date_path}</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  modalTitle: {
    flex: 1,
    color: "white",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: 12,
  },
  modalActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(76,175,80,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlayerContainer: {
    flex: 1,
  },
  videoPlayer: {
    flex: 1,
    backgroundColor: "#000",
  },
  modalInfoBar: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
  },
  modalInfoText: {
    color: "#888",
    fontSize: 13,
  },
  modalInfoPath: {
    color: "#14B8A6",
    fontSize: 11,
    marginTop: 4,
    opacity: 0.8,
  },
});
