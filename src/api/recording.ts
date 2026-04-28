import { API_BASE_URL } from "../config";
import { fetchWithTimeout, handleApiError } from "./client";
import { ApiResponse } from "./types";

export const recordingApi = {
  /**
   * Start manual recording
   */
  start: async (): Promise<ApiResponse> => {
    try {
      console.log("🔴 Calling start recording API...");
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/record/start`,
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
      console.log("🔴 Start recording response:", data);
      return data;
    } catch (error: any) {
      return handleApiError(error);
    }
  },

  /**
   * Stop manual recording
   */
  stop: async (): Promise<ApiResponse> => {
    try {
      console.log("⏹ Calling stop recording API...");
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/record/stop`,
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
      console.log("⏹ Stop recording response:", data);
      return data;
    } catch (error: any) {
      return handleApiError(error);
    }
  },

  /**
   * Start 24/7 recording mode
   */
  start247: async (): Promise<ApiResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/recording/247/start`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Stop 24/7 recording mode
   */
  stop247: async (): Promise<ApiResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/recording/247/stop`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
