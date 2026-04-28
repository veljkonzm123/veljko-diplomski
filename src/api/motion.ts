import { API_BASE_URL } from "../config";
import { fetchWithTimeout } from "./client";
import { ApiResponse, MotionConfig, MotionConfigResponse } from "./types";

export const motionApi = {
  /**
   * Get motion detection configuration
   */
  getConfig: async (): Promise<MotionConfigResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/motion/config`,
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
   * Start motion detection
   */
  start: async (): Promise<ApiResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/motion/start`,
        {
          method: "POST",
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
   * Stop motion detection
   */
  stop: async (): Promise<ApiResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/motion/stop`,
        {
          method: "POST",
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
   * Update motion detection configuration
   */
  updateConfig: async (config: Partial<MotionConfig>): Promise<ApiResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/motion/config`,
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
