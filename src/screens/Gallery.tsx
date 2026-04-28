import React from "react";
import {
  View,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  Text,
  RefreshControl,
} from "react-native";
import { useGallery } from "../hooks/useGallery";
import { groupByDay } from "../utils/galleryHelpers";
import {
  GalleryHeader,
  GalleryTabs,
  SectionHeader,
  PhotoGrid,
  VideoList,
  EmptyState,
  ImageModal,
  VideoModal,
} from "../components/gallery";

export default function Gallery() {
  const {
    subTab,
    snapshots,
    videos,
    loading,
    refreshing,
    selectedImage,
    selectedVideo,
    setSubTab,
    onRefresh,
    handleDeleteSnapshot,
    handleDeleteVideo,
    setSelectedImage,
    setSelectedVideo,
  } = useGallery();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#14B8A6" />
        <Text style={styles.loadingText}>Loading files...</Text>
      </View>
    );
  }

  const photoSections = groupByDay(snapshots, "photos");
  const videoSections = groupByDay(videos, "videos");
  const currentSections = subTab === "photos" ? photoSections : videoSections;

  return (
    <View style={styles.container}>
      <GalleryHeader photoCount={snapshots.length} videoCount={videos.length} />

      <GalleryTabs
        activeTab={subTab}
        photoCount={snapshots.length}
        videoCount={videos.length}
        onTabChange={setSubTab}
      />

      {currentSections.length === 0 ? (
        <EmptyState tab={subTab} />
      ) : (
        <SectionList
          key={subTab}
          sections={currentSections}
          keyExtractor={(row, index) =>
            row.map((f) => f.filename).join("-") + index
          }
          renderSectionHeader={({ section }) => (
            <SectionHeader section={section} />
          )}
          renderItem={({ item }) =>
            subTab === "photos" ? (
              <PhotoGrid row={item} onPress={setSelectedImage} />
            ) : (
              <VideoList
                row={item}
                onPress={setSelectedVideo}
                onDelete={handleDeleteVideo}
              />
            )
          }
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#14B8A6"
              colors={["#14B8A6"]}
            />
          }
        />
      )}

      <ImageModal
        file={selectedImage}
        onClose={() => setSelectedImage(null)}
        onDelete={handleDeleteSnapshot}
      />

      <VideoModal
        file={selectedVideo}
        onClose={() => setSelectedVideo(null)}
        onDelete={handleDeleteVideo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#888",
    marginTop: 16,
    fontSize: 14,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
});
