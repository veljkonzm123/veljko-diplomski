export const fetchWithTimeout = async (
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

export const handleApiError = (error: any) => {
  if (error.name === "AbortError") {
    return { success: false, error: "Request timed out." };
  }
  return {
    success: false,
    error: error.message || "An unknown error occurred",
  };
};
