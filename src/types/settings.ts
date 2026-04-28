export interface SettingsState {
  // Motion Detection
  motionEnabled: boolean;
  motionSensitivity: number;
  motionMinArea: number;
  motionCooldown: number;
  motionAutoRecord: boolean;
  is247RecordingEnabled: boolean;

  // Video Quality
  videoResolution: "720p" | "1080p" | "480p";
  videoBitrate: number;
  videoFPS: number;

  // Storage
  autoDeleteEnabled: boolean;
  autoDeleteDays: number;
  maxStorageGB: number;
  checkIntervalHours: number;
  warningThresholdPct: number;

  // Notifications
  notifyMotion: boolean;
  notifyRecording: boolean;
  notifyStorage: boolean;
}

export interface SettingsActions {
  updateSetting: <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => void;
  saveSettings: () => Promise<void>;
  loadSettings: () => Promise<void>;
  handle247RecordingToggle: (value: boolean) => Promise<void>;
}
