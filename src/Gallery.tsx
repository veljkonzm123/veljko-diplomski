import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  Image,
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Dimensions,
  Linking,
} from "react-native";
import { WebView } from "react-native-webview";
import { CameraAPI, FileInfo } from "./api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_COLUMNS = 3;
const GRID_SPACING = 4;
const THUMB_SIZE =
  (SCREEN_WIDTH - 40 - GRID_SPACING * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

// ─── Types ───

interface GallerySection {
  title: string; // e.g. "December 2024"
  subtitle: string; // e.g. "Monday, 15"
  data: FileInfo[][]; // rows of GRID_COLUMNS for photos, or single-item rows for videos
  date_path: string; // raw "2024-12/15"
}

// ─── Helpers ───

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  const month = date.toLocaleString("default", { month: "short" });
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, "0");
  const mins = date.getMinutes().toString().padStart(2, "0");
  return `${month} ${day}, ${hours}:${mins}`;
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  const hours = date.getHours().toString().padStart(2, "0");
  const mins = date.getMinutes().toString().padStart(2, "0");
  const secs = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${mins}:${secs}`;
};

/**
 * "2024-12/15"  →  { monthTitle: "December 2024", dayTitle: "Monday, 15" }
 * Falls back gracefully if date_path is missing/malformed.
 */
const parseDatePath = (date_path: string, fallback_ts: number) => {
  try {
    if (date_path && date_path.includes("/")) {
      const [yearMonth, day] = date_path.split("/");
      const [year, month] = yearMonth.split("-");

      const date = new Date(Number(year), Number(month) - 1, Number(day));

      const monthTitle = date.toLocaleString("default", {
        month: "long",
        year: "numeric",
      }); // "December 2024"

      const dayTitle = date.toLocaleString("default", {
        weekday: "long",
        day: "numeric",
      }); // "Sunday, 15"

      return {
        monthTitle,
        dayTitle,
        sortKey: `${yearMonth}/${day.padStart(2, "0")}`,
      };
    }
  } catch {}

  // Fallback: use the file's mtime
  const date = new Date(fallback_ts * 1000);
  return {
    monthTitle: date.toLocaleString("default", {
      month: "long",
      year: "numeric",
    }),
    dayTitle: date.toLocaleString("default", {
      weekday: "long",
      day: "numeric",
    }),
    sortKey: date.toISOString().slice(0, 10),
  };
};

/**
 * Group flat FileInfo[] into SectionList sections, one section per day.
 * For photos we chunk each day's files into rows of GRID_COLUMNS.
 * For videos each file is its own "row" (wrapped in an array for uniform data shape).
 */
const groupByDay = (
  files: FileInfo[],
  mode: "photos" | "videos",
): GallerySection[] => {
  // Map: sortKey → { meta, files[] }
  const map = new Map<
    string,
    {
      monthTitle: string;
      dayTitle: string;
      date_path: string;
      files: FileInfo[];
    }
  >();

  for (const file of files) {
    const { monthTitle, dayTitle, sortKey } = parseDatePath(
      file.date_path || "",
      file.created,
    );

    if (!map.has(sortKey)) {
      map.set(sortKey, {
        monthTitle,
        dayTitle,
        date_path: file.date_path || "",
        files: [],
      });
    }
    map.get(sortKey)!.files.push(file);
  }

  // Sort sections newest-first
  const sorted = Array.from(map.entries()).sort((a, b) =>
    b[0].localeCompare(a[0]),
  );

  return sorted.map(([, value]) => {
    // Chunk files into rows
    const rows: FileInfo[][] = [];
    if (mode === "photos") {
      for (let i = 0; i < value.files.length; i += GRID_COLUMNS) {
        rows.push(value.files.slice(i, i + GRID_COLUMNS));
      }
    } else {
      value.files.forEach((f) => rows.push([f]));
    }

    return {
      title: value.monthTitle,
      subtitle: value.dayTitle,
      data: rows,
      date_path: value.date_path,
    };
  });
};

// ─── Component ───

export default function Gallery() {
  const [subTab, setSubTab] = useState<"photos" | "videos">("photos");
  const [snapshots, setSnapshots] = useState<FileInfo[]>([]);
  const [videos, setVideos] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedImage, setSelectedImage] = useState<FileInfo | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<FileInfo | null>(null);

  // ─── Fetch ───

  const fetchFiles = useCallback(async () => {
    try {
      const [snapshotResult, videoResult] = await Promise.all([
        CameraAPI.listSnapshots(),
        CameraAPI.listVideos(),
      ]);
      if (snapshotResult.success) setSnapshots(snapshotResult.files);
      if (videoResult.success) setVideos(videoResult.files);
    } catch (error) {
      console.error("Failed to fetch files:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFiles();
  };

  // ─── Delete handlers ───

  const handleDeleteSnapshot = (file: FileInfo) => {
    Alert.alert(
      "🗑️ Delete Snapshot?",
      `Delete ${file.filename}?\n\nThis cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const result = await CameraAPI.deleteSnapshot(file.filename);
            if (result.success) {
              setSnapshots((prev) =>
                prev.filter((f) => f.filename !== file.filename),
              );
              setSelectedImage(null);
            } else {
              Alert.alert("❌ Error", result.error || "Failed to delete");
            }
          },
        },
      ],
    );
  };

  const handleDeleteVideo = (file: FileInfo) => {
    Alert.alert(
      "🗑️ Delete Video?",
      `Delete ${file.filename}?\n\nThis cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const result = await CameraAPI.deleteVideo(
              file.path || file.filename,
            );
            if (result.success) {
              setVideos((prev) =>
                prev.filter((f) => f.filename !== file.filename),
              );
              setSelectedVideo(null);
            } else {
              Alert.alert("❌ Error", result.error || "Failed to delete");
            }
          },
        },
      ],
    );
  };

  // ─── Section header ───

  const renderSectionHeader = ({ section }: { section: GallerySection }) => (
    <View style={styles.sectionHeader}>
      {/* Day is the primary heading */}
      <Text style={styles.sectionDay}>{section.subtitle}</Text>
      {/* Month/year is the secondary label */}
      <Text style={styles.sectionMonth}>{section.title}</Text>
    </View>
  );

  // ─── Photo row (one row of up to GRID_COLUMNS thumbnails) ───

  const renderPhotoRow = ({ item: row }: { item: FileInfo[] }) => (
    <View style={styles.gridRow}>
      {row.map((file) => (
        <TouchableOpacity
          key={file.filename}
          style={styles.gridItem}
          onPress={() => setSelectedImage(file)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: CameraAPI.getSnapshotUrl(file.filename) }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
          <View style={styles.gridItemInfo}>
            <Text style={styles.gridItemTime}>{formatTime(file.created)}</Text>
            <Text style={styles.gridItemSize}>{formatFileSize(file.size)}</Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* Fill empty cells so the last row aligns left */}
      {row.length < GRID_COLUMNS &&
        Array.from({ length: GRID_COLUMNS - row.length }).map((_, i) => (
          <View key={`empty-${i}`} style={styles.gridItemPlaceholder} />
        ))}
    </View>
  );

  // ─── Video row (single item per row) ───

  const renderVideoRow = ({ item: row }: { item: FileInfo[] }) => {
    const file = row[0];
    const isMotionVideo = file.filename.startsWith("mot_");

    const icon = isMotionVideo ? "🚨" : "🎥";
    const typeLabel = isMotionVideo ? "Motion" : "Manual";
    const iconBgColor = isMotionVideo
      ? "rgba(168, 33, 15, 0.74)" // Orange for motion
      : "rgba(22, 85, 33, 0.2)"; // Red for manual record
    return (
      <TouchableOpacity
        style={styles.videoItem}
        onPress={() => setSelectedVideo(file)}
        activeOpacity={0.7}
      >
        <View style={[styles.videoIcon, { backgroundColor: iconBgColor }]}>
          <Text style={styles.videoIconText}>{icon}</Text>
        </View>

        <View style={styles.videoInfo}>
          <Text style={styles.videoFilename} numberOfLines={1}>
            {file.filename}
          </Text>
          {/* 4. Add the type label to the metadata */}
          <Text style={styles.videoMeta}>
            {formatFileSize(file.size)} • {formatTime(file.created)} •{" "}
            {typeLabel}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteVideo(file)}
        >
          <Text style={styles.deleteButtonText}>🗑️</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // ─── Empty state ───

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{subTab === "photos" ? "📷" : "🎬"}</Text>
      <Text style={styles.emptyTitle}>
        No {subTab === "photos" ? "snapshots" : "videos"} yet
      </Text>
      <Text style={styles.emptyText}>
        {subTab === "photos"
          ? "Take a snapshot from the Live view"
          : "Start recording from the Live view"}
      </Text>
    </View>
  );

  // ─── Image modal ───

  const renderImageModal = () => (
    <Modal
      visible={selectedImage !== null}
      animationType="fade"
      transparent={false}
      onRequestClose={() => setSelectedImage(null)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setSelectedImage(null)}
          >
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.modalTitle} numberOfLines={1}>
            {selectedImage?.filename}
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={styles.modalActionButton}
              onPress={() => {
                if (selectedImage)
                  Linking.openURL(
                    CameraAPI.getSnapshotUrl(selectedImage.filename),
                  );
              }}
            >
              <Text style={{ fontSize: 18 }}>⬇️</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalActionButton,
                { backgroundColor: "rgba(244,67,54,0.3)" },
              ]}
              onPress={() =>
                selectedImage && handleDeleteSnapshot(selectedImage)
              }
            >
              <Text style={{ fontSize: 18 }}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.modalImageContainer}>
          {selectedImage && (
            <Image
              source={{ uri: CameraAPI.getSnapshotUrl(selectedImage.filename) }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          )}
        </View>

        {selectedImage && (
          <View style={styles.modalInfoBar}>
            <Text style={styles.modalInfoText}>
              {formatDate(selectedImage.created)} •{" "}
              {formatFileSize(selectedImage.size)}
            </Text>
            {selectedImage.date_path ? (
              <Text style={styles.modalInfoPath}>
                📁 {selectedImage.date_path}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );

  // ─── Video modal ───

  const renderVideoModal = () => {
    if (!selectedVideo) return null;
    const videoUrl = CameraAPI.getVideoUrl(
      selectedVideo.path || selectedVideo.filename,
    );

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
        onRequestClose={() => setSelectedVideo(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setSelectedVideo(null)}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.modalTitle} numberOfLines={1}>
              {selectedVideo.filename}
            </Text>

            <TouchableOpacity
              style={[
                styles.modalActionButton,
                { backgroundColor: "rgba(244,67,54,0.3)" },
              ]}
              onPress={() => handleDeleteVideo(selectedVideo)}
            >
              <Text style={{ fontSize: 18 }}>🗑️</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.videoPlayerContainer}>
            <WebView
              source={{ html: videoHTML }}
              style={styles.videoPlayer}
              javaScriptEnabled
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
            />
          </View>

          <View style={styles.modalInfoBar}>
            <Text style={styles.modalInfoText}>
              {formatDate(selectedVideo.created)} •{" "}
              {formatFileSize(selectedVideo.size)}
            </Text>
            {selectedVideo.date_path ? (
              <Text style={styles.modalInfoPath}>
                📁 {selectedVideo.date_path}
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>
    );
  };

  // ─── Loading ───

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#14B8A6" />
        <Text style={styles.loadingText}>Loading files...</Text>
      </View>
    );
  }

  // ─── Derived data ───

  const photoSections = groupByDay(snapshots, "photos");
  const videoSections = groupByDay(videos, "videos");
  const currentSections = subTab === "photos" ? photoSections : videoSections;

  // ─── Main render ───

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Gallery</Text>
        <Text style={styles.subtitle}>
          {snapshots.length} photos • {videos.length} videos
        </Text>
      </View>

      {/* Sub-tabs */}
      <View style={styles.subTabs}>
        <TouchableOpacity
          style={[styles.subTab, subTab === "photos" && styles.subTabActive]}
          onPress={() => setSubTab("photos")}
        >
          <Text
            style={[
              styles.subTabText,
              subTab === "photos" && styles.subTabTextActive,
            ]}
          >
            Photos ({snapshots.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === "videos" && styles.subTabActive]}
          onPress={() => setSubTab("videos")}
        >
          <Text
            style={[
              styles.subTabText,
              subTab === "videos" && styles.subTabTextActive,
            ]}
          >
            Videos ({videos.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Grouped content */}
      {currentSections.length === 0 ? (
        renderEmpty()
      ) : (
        <SectionList
          key={subTab} // re-mount when tab changes
          sections={currentSections}
          keyExtractor={(row, index) =>
            row.map((f) => f.filename).join("-") + index
          }
          renderSectionHeader={renderSectionHeader}
          renderItem={subTab === "photos" ? renderPhotoRow : renderVideoRow}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={true} // month/day header sticks while scrolling
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#14B8A6"
              colors={["#14B8A6"]}
            />
          }
        />
      )}

      {renderImageModal()}
      {renderVideoModal()}
    </View>
  );
}

// ─── Styles ───

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#888", marginTop: 16, fontSize: 14 },

  // Header
  header: { alignItems: "center", marginBottom: 16 },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#14B8A6",
    marginBottom: 4,
  },
  subtitle: { fontSize: 13, color: "#666" },

  // Sub-tabs
  subTabs: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
  },
  subTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  subTabActive: { backgroundColor: "#14B8A6" },
  subTabText: { color: "#888", fontSize: 14, fontWeight: "600" },
  subTabTextActive: { color: "white" },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 10,
    backgroundColor: "#0f0f1a", // matches app background so it looks native when sticky
    borderBottomWidth: 1,
    borderBottomColor: "rgba(76,175,80,0.2)",
    marginBottom: 8,
  },
  sectionDay: {
    fontSize: 16,
    fontWeight: "700",
    color: "#e0e0e0",
  },
  sectionMonth: {
    fontSize: 12,
    color: "#14B8A6",
    fontWeight: "600",
  },

  // Grid (photos)
  listContent: { flexGrow: 1, paddingBottom: 20 },
  gridRow: {
    flexDirection: "row",
    gap: GRID_SPACING,
    marginBottom: GRID_SPACING,
  },
  gridItem: {
    width: THUMB_SIZE,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    overflow: "hidden",
  },
  gridItemPlaceholder: { width: THUMB_SIZE },
  thumbnail: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    backgroundColor: "#1a1a2e",
  },
  gridItemInfo: { padding: 6 },
  gridItemTime: { color: "#ccc", fontSize: 11, fontWeight: "600" },
  gridItemSize: { color: "#666", fontSize: 10, marginTop: 2 },

  // List (videos)
  videoItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  videoIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(76,175,80,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  videoIconText: { fontSize: 24 },
  videoInfo: { flex: 1 },
  videoFilename: {
    color: "#ddd",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  videoMeta: { color: "#888", fontSize: 12 },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButtonText: { fontSize: 18 },

  // Empty
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: {
    color: "#888",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  emptyText: { color: "#555", fontSize: 14, textAlign: "center" },

  // Modal (shared)
  modalContainer: { flex: 1, backgroundColor: "#000" },
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
  modalCloseText: { color: "white", fontSize: 18, fontWeight: "bold" },
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
  modalInfoBar: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
  },
  modalInfoText: { color: "#888", fontSize: 13 },
  modalInfoPath: { color: "#14B8A6", fontSize: 11, marginTop: 4, opacity: 0.8 },

  // Image modal
  modalImageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalImage: { width: "100%", height: "100%" },

  // Video modal
  videoPlayerContainer: { flex: 1 },
  videoPlayer: { flex: 1, backgroundColor: "#000" },
});