import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  Linking,
} from "react-native";
import { FileInfo, CameraAPI } from "../../api";
import { formatDate, formatFileSize } from "../../utils/formatters";

interface Props {
  file: FileInfo | null;
  onClose: () => void;
  onDelete: (file: FileInfo) => void;
}

export function ImageModal({ file, onClose, onDelete }: Props) {
  if (!file) return null;

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

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={styles.modalActionButton}
              onPress={() =>
                Linking.openURL(CameraAPI.getSnapshotUrl(file.filename))
              }
            >
              <Text style={{ fontSize: 18 }}>⬇️</Text>
            </TouchableOpacity>

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
        </View>

        {/* Image */}
        <View style={styles.modalImageContainer}>
          <Image
            source={{ uri: CameraAPI.getSnapshotUrl(file.filename) }}
            style={styles.modalImage}
            resizeMode="contain"
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
  modalImageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalImage: {
    width: "100%",
    height: "100%",
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
