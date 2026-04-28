// ========== Camera Types ==========
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

export interface CameraConfig {
  resolution: string;
  bitrate: number;
  jpeg_quality: number;
}

export interface CameraConfigResponse {
  success: boolean;
  config?: {
    resolution: string;
    bitrate: number;
    jpeg_quality: number;
  };
  error?: string;
}

// ========== File Types ==========
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

// ========== Motion Types ==========
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

// ========== Storage Types ==========
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
  check_interval_hours: number;
  warning_threshold_pct: number;
}

export interface StorageConfigResponse {
  success: boolean;
  config?: StorageConfig;
  error?: string;
}

export interface StorageStatusResponse {
  success: boolean;
  status?: StorageStatus;
  error?: string;
}

// ========== MQTT Message Types ==========
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
  is_247_recording_active?: boolean;
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

export interface StorageMessage {
  timestamp: string;
  type: "storage_warning";
  used_pct: number;
  free_gb: number;
}
