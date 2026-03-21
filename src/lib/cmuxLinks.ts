import { cmuxBrowserOpen } from "./tauri";

/**
 * Open a URL in the cmux browser for the given workspace, or fall back
 * to the system browser if cmux is not available or no workspace matches.
 */
export async function openDirectivLink(
  url: string,
  workspaceName: string | null,
  isCmux: boolean,
): Promise<void> {
  if (isCmux && workspaceName) {
    try {
      const opened = await cmuxBrowserOpen(workspaceName, url);
      if (opened) return;
    } catch (err) {
      console.warn("[cmuxLinks] browser_open failed, falling back:", err);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
