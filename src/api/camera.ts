import { API_BASE_URL } from "../config";
import { fetchWithTimeout, handleApiError } from "./client";
import { ApiResponse, CameraStatus, CameraConfigResponse } from "./types";

export const cameraApi = {
  /**
   * Get current camera status
   */
  getStatus: async (): Promise<{
    success: boolean;
    data?: CameraStatus;
    error?: string;
  }> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/status`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
        8000,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return { success: true, data };
    } catch (error: any) {
      if (error.name === "AbortError") {
        return { success: false, error: "timeout" };
      }
      return { success: false, error: error.message };
    }
  },

  /**
   * Take a snapshot
   */
  takeSnapshot: async (): Promise<ApiResponse> => {
    try {
      console.log("📷 Calling snapshot API...");
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/snapshot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
        10000,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      console.log("📷 Snapshot response:", data);
      return data;
    } catch (error: any) {
      return handleApiError(error);
    }
  },

  /**
   * Get camera configuration
   */
  getConfig: async (): Promise<CameraConfigResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/camera/config`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Update camera configuration
   */
  updateConfig: async (config: {
    resolution?: string;
    bitrate?: number;
  }): Promise<ApiResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/camera/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(config),
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
