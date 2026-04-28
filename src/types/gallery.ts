import { FileInfo } from "../api";

export interface GallerySection {
  title: string; // e.g. "December 2024"
  subtitle: string; // e.g. "Monday, 15"
  data: FileInfo[][]; // rows of files
  date_path: string; // raw "2024-12/15"
}

export type GalleryTab = "photos" | "videos";

export interface GalleryState {
  subTab: GalleryTab;
  snapshots: FileInfo[];
  videos: FileInfo[];
  loading: boolean;
  refreshing: boolean;
  selectedImage: FileInfo | null;
  selectedVideo: FileInfo | null;
}

export interface GalleryActions {
  setSubTab: (tab: GalleryTab) => void;
  fetchFiles: () => Promise<void>;
  onRefresh: () => void;
  handleDeleteSnapshot: (file: FileInfo) => void;
  handleDeleteVideo: (file: FileInfo) => void;
  setSelectedImage: (file: FileInfo | null) => void;
  setSelectedVideo: (file: FileInfo | null) => void;
}
