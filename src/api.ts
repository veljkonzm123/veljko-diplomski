import { API_BASE_URL } from "./config";

// ========== Existing Types ==========
export interface ApiResponse {
  success: boolean;
  filename?: string;
  error?: string;
  data?: any;
}

export interface CameraStatus {
  initialized: boolean;
  streaming: boolean;
  recording: boolean;
  recording_duration: number;
  current_video: string | null;
  resolution: string;
  motion_detecting?: boolean;
  is_247_recording_active?: boolean;
}

export interface FileInfo {
  filename: string;
  path?: string;
  date_path?: string;
  size: number;
  created: number;
}

export interface FileListResponse {
  success: boolean;
  files: FileInfo[];
  count: number;
  error?: string;
}

export interface StatusMessage {
  timestamp: string;
  online: boolean;
  initialized: boolean;
  streaming: boolean;
  recording: boolean;
  recording_duration: number;
  current_video: string | null;
  resolution: string;
  motion_detecting?: boolean;
}

export interface MotionConfig {
  enabled: boolean;
  sensitivity: number;
  min_area: number;
  cooldown: number;
  auto_record: boolean;
}
export interface MotionConfigResponse {
  success: boolean;
  config?: MotionConfig;
  state?: {
    detecting: boolean;
    last_trigger: string | null;
  };
  error?: string;
}

export interface MotionMessage {
  timestamp: string;
  type: "motion_detected";
  confidence: number;
  snapshot: string;
}

export interface RecordingMessage {
  timestamp: string;
  type: "recording_started" | "recording_stopped";
  filename: string;
  duration?: number;
  size?: number;
}

export interface SnapshotMessage {
  timestamp: string;
  type: "snapshot_taken";
  filename: string;
}

export interface FileMessage {
  timestamp: string;
  type: "file_deleted";
  filename: string;
}

export interface CameraConfig {
  resolution: string; // "1280x720"
  bitrate: number;
  jpeg_quality: number;
}

export interface CameraConfigResponse {
  success: boolean;
  config?: {
    resolution: string; // "1280x720"
    bitrate: number; // in bps e.g. 8000000
    jpeg_quality: number;
  };
  error?: string;
}

export interface StorageStatus {
  total_gb: number;
  used_gb: number;
  free_gb: number;
  used_pct: number;
}

export interface StorageConfig {
  auto_delete_enabled: boolean;
  max_days: number;
  max_gb: number;
}
export interface StorageConfigResponse {
  success: boolean;
  config?: StorageConfig; // The key is 'config'
  error?: string;
}
export interface StorageStatusResponse {
  success: boolean;
  status?: StorageStatus; // The key is 'status', matching your Python backend
  error?: string;
}
export interface StorageMessage {
  timestamp: string;
  type: "storage_warning";
  used_pct: number;
  free_gb: number;
}

const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 10000,
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const CameraAPI = {
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
      if (error.name === "AbortError") {
        return { success: false, error: "Request timed out." };
      }
      return {
        success: false,
        error: error.message || "Failed to take snapshot",
      };
    }
  },

  startRecording: async (): Promise<ApiResponse> => {
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
      if (error.name === "AbortError") {
        return { success: false, error: "Request timed out." };
      }
      return {
        success: false,
        error: error.message || "Failed to start recording",
      };
    }
  },

  stopRecording: async (): Promise<ApiResponse> => {
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
      if (error.name === "AbortError") {
        return { success: false, error: "Request timed out." };
      }
      return {
        success: false,
        error: error.message || "Failed to stop recording",
      };
    }
  },

  start247Recording: async (): Promise<ApiResponse> => {
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

  stop247Recording: async (): Promise<ApiResponse> => {
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

  getSnapshotUrl: (filename: string): string => {
    return `${API_BASE_URL}/api/files/snapshot/${filename}`;
  },

  getVideoUrl: (path: string): string => {
    return `${API_BASE_URL}/api/files/video/${path}`;
  },

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

  getFileUrl: (filename: string, type: "snapshot" | "video"): string => {
    const folder = type === "snapshot" ? "snapshot" : "video";
    return `${API_BASE_URL}/api/files/${folder}/${filename}`;
  },

  getMotionConfig: async (): Promise<MotionConfigResponse> => {
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

  startMotionDetection: async (): Promise<ApiResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/motion/start`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) {
        // <-- Add error check
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  stopMotionDetection: async (): Promise<ApiResponse> => {
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

  updateMotionConfig: async (
    config: Partial<MotionConfig>,
  ): Promise<ApiResponse> => {
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

  getCameraConfig: async (): Promise<CameraConfigResponse> => {
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

  updateCameraConfig: async (config: {
    resolution?: string; // "480p" | "720p" | "1080p"
    bitrate?: number; // in Kbps e.g. 8000
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

  getStorageStatus: async (): Promise<StorageStatusResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/storage/status`,
        { method: "GET" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error: any) {
      // 👇 THE FIX IS HERE 👇
      // On failure, return a complete response object with a default/empty 'status'.
      return {
        success: false,
        status: { total_gb: 0, used_gb: 0, free_gb: 0, used_pct: 0 },
        error: error.message,
      };
    }
  },
  getStorageConfig: async (): Promise<StorageConfigResponse> => {
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/storage/config`,
        { method: "GET" }, // It's good practice to be explicit with GET
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  updateStorageConfig: async (
    config: Partial<StorageConfig>,
  ): Promise<StorageConfigResponse> => {
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
