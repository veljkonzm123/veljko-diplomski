import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import { CameraAPI, FileInfo } from "../api";
import { GalleryTab, GalleryState, GalleryActions } from "../types/gallery";

export function useGallery(): GalleryState & GalleryActions {
  const [subTab, setSubTab] = useState<GalleryTab>("photos");
  const [snapshots, setSnapshots] = useState<FileInfo[]>([]);
  const [videos, setVideos] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<FileInfo | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<FileInfo | null>(null);

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

  return {
    // State
    subTab,
    snapshots,
    videos,
    loading,
    refreshing,
    selectedImage,
    selectedVideo,

    // Actions
    setSubTab,
    fetchFiles,
    onRefresh,
    handleDeleteSnapshot,
    handleDeleteVideo,
    setSelectedImage,
    setSelectedVideo,
  };
}
