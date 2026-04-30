import { useState, useRef } from "react";
import { WebView } from "react-native-webview";
import { StreamState } from "../types/app";

export function useLiveStream() {
  const [state, setState] = useState<StreamState>({
    isLoading: true,
    hasError: false,
    retryKey: 0,
    streamPaused: false,
    pauseReason: "",
  });

  const webViewRef = useRef<WebView>(null);
  const apiInProgress = useRef(false);

  const handleLoadEnd = () => {
    setState((prev) => ({ ...prev, isLoading: false, hasError: false }));
  };

  const handleError = () => {
    setState((prev) => ({ ...prev, isLoading: false, hasError: true }));
  };

  const retryConnection = () => {
    setState({
      isLoading: true,
      hasError: false,
      retryKey: state.retryKey + 1,
      streamPaused: false,
      pauseReason: "",
    });
  };

  const withStreamPaused = async <T>(
    reason: string,
    apiCall: () => Promise<T>,
  ): Promise<T> => {
    apiInProgress.current = true;
    setState((prev) => ({ ...prev, pauseReason: reason, streamPaused: true }));
    await new Promise((resolve) => setTimeout(resolve, 600));

    try {
      return await apiCall();
    } finally {
      setState((prev) => ({
        ...prev,
        streamPaused: false,
        pauseReason: "",
        retryKey: prev.retryKey + 1,
        isLoading: true,
      }));
      apiInProgress.current = false;
    }
  };

  return {
    state,
    webViewRef,
    apiInProgress,
    handleLoadEnd,
    handleError,
    retryConnection,
    withStreamPaused,
  };
}
