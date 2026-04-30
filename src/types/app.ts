export type TabName = "live" | "gallery" | "settings";

export interface StreamState {
  isLoading: boolean;
  hasError: boolean;
  retryKey: number;
  streamPaused: boolean;
  pauseReason: string;
}

export interface LoadingState {
  snapshot: boolean;
  recording: boolean;
  motion: boolean;
}

// 👇 Add notification data types
export interface NotificationData {
  type?: string;
  filename?: string;
  confidence?: number;
  snapshot?: string;
  timestamp?: string;
  [key: string]: any;
}
