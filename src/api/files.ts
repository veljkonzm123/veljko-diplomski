import { API_BASE_URL } from "../config";
import { fetchWithTimeout } from "./client";
import { FileListResponse, ApiResponse } from "./types";

export const filesApi = {
  /**
   * List all snapshots
   */
  listSnapshots: async (): Promise<FileListResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/files/snapshots`,
        { method: "GET", headers: { Accept: "application/json" } },
        10000,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error: any) {
      return { success: false, files: [], count: 0, error: error.message };
    }
  },

  /**
   * List all videos
   */
  listVideos: async (): Promise<FileListResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/files/videos`,
        { method: "GET", headers: { Accept: "application/json" } },
        10000,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error: any) {
      return { success: false, files: [], count: 0, error: error.message };
    }
  },

  /**
   * Get snapshot URL
   */
  getSnapshotUrl: (filename: string): string => {
    return `${API_BASE_URL}/api/files/snapshot/${filename}`;
  },

  /**
   * Get video URL
   */
  getVideoUrl: (path: string): string => {
    return `${API_BASE_URL}/api/files/video/${path}`;
  },

  /**
   * Delete a snapshot
   */
  deleteSnapshot: async (filename: string): Promise<ApiResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/files/snapshot/${filename}`,
        { method: "DELETE", headers: { Accept: "application/json" } },
        10000,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Delete a video
   */
  deleteVideo: async (path: string): Promise<ApiResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/files/video/${path}`,
        { method: "DELETE", headers: { Accept: "application/json" } },
        10000,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
