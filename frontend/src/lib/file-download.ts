/**
 * Triggers a direct file download in the browser without opening a new tab.
 * Uses fetch + Blob URL with HTML5 `<a download>` attribute.
 * Falls back safely to direct link navigation or window.open if running in
 * constrained or non-DOM environments.
 */
export async function downloadFileFromUrl(url: string, fileName?: string): Promise<void> {
  if (typeof window === "undefined") return;

  // Non-DOM environment fallback (e.g. Node.js unit tests without full jsdom)
  if (typeof document === "undefined") {
    if (typeof window.open === "function") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    const blob = await response.blob();
    const createUrl =
      window.URL?.createObjectURL ||
      (window as unknown as { webkitURL?: { createObjectURL: (b: Blob) => string } }).webkitURL?.createObjectURL;
    if (!createUrl) {
      throw new Error("createObjectURL is not supported");
    }
    const objectUrl = createUrl(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    if (fileName) {
      link.download = fileName;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl);
    }, 1000);
  } catch {
    try {
      const link = document.createElement("a");
      link.href = url;
      if (fileName) {
        link.download = fileName;
      }
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      if (typeof window.open === "function") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  }
}
