// Export all types
export * from "./types";

// Export individual API modules
export { cameraApi } from "./camera";
export { recordingApi } from "./recording";
export { filesApi } from "./files";
export { motionApi } from "./motion";
export { storageApi } from "./storage";

// ========== Backward-Compatible CameraAPI Object ==========
// This maintains your existing import structure: import { CameraAPI } from "./api"

import { cameraApi } from "./camera";
import { recordingApi } from "./recording";
import { filesApi } from "./files";
import { motionApi } from "./motion";
import { storageApi } from "./storage";

export const CameraAPI = {
  // Camera
  getStatus: cameraApi.getStatus,
  takeSnapshot: cameraApi.takeSnapshot,
  getCameraConfig: cameraApi.getConfig,
  updateCameraConfig: cameraApi.updateConfig,

  // Recording
  startRecording: recordingApi.start,
  stopRecording: recordingApi.stop,
  start247Recording: recordingApi.start247,
  stop247Recording: recordingApi.stop247,

  // Files
  listSnapshots: filesApi.listSnapshots,
  listVideos: filesApi.listVideos,
  getSnapshotUrl: filesApi.getSnapshotUrl,
  getVideoUrl: filesApi.getVideoUrl,
  deleteSnapshot: filesApi.deleteSnapshot,
  deleteVideo: filesApi.deleteVideo,

  // Motion
  getMotionConfig: motionApi.getConfig,
  startMotionDetection: motionApi.start,
  stopMotionDetection: motionApi.stop,
  updateMotionConfig: motionApi.updateConfig,

  // Storage
  getStorageStatus: storageApi.getStatus,
  getStorageConfig: storageApi.getConfig,
  updateStorageConfig: storageApi.updateConfig,

  // Legacy helper (if you had this)
  getFileUrl: (filename: string, type: "snapshot" | "video"): string => {
    return type === "snapshot"
      ? filesApi.getSnapshotUrl(filename)
      : filesApi.getVideoUrl(filename);
  },
};
