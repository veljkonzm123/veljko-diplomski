import { useState } from "react";
import * as ScreenOrientation from "expo-screen-orientation";

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const enterFullscreen = async () => {
    try {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      );
      setIsFullscreen(true);
    } catch (error) {
      console.error("Failed to enter fullscreen:", error);
    }
  };

  const exitFullscreen = async () => {
    try {
      await ScreenOrientation.unlockAsync();
      setIsFullscreen(false);
    } catch (error) {
      console.error("Failed to exit fullscreen:", error);
    }
  };

  return {
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
  };
}
