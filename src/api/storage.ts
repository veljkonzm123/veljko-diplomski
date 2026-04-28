import { API_BASE_URL } from "../config";
import { fetchWithTimeout } from "./client";
import {
  StorageStatus,
  StorageConfig,
  StorageStatusResponse,
  StorageConfigResponse,
} from "./types";

export const storageApi = {
  /**
   * Get current storage status
   */
  getStatus: async (): Promise<StorageStatusResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/storage/status`,
        { method: "GET" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error: any) {
      return {
        success: false,
        status: { total_gb: 0, used_gb: 0, free_gb: 0, used_pct: 0 },
        error: error.message,
      };
    }
  },

  /**
   * Get storage configuration
   */
  getConfig: async (): Promise<StorageConfigResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/storage/config`,
        { method: "GET" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Update storage configuration
   */
  updateConfig: async (
    config: Partial<StorageConfig>,
  ): Promise<StorageConfigResponse> => {
    console.log("Sending to server:", config);
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/storage/config`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
