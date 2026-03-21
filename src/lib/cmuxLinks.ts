import { openUrl } from "@tauri-apps/plugin-opener";
import { cmuxBrowserOpen } from "./tauri";

/**
 * Open a URL in the cmux browser for the given workspace, or fall back
 * to the system browser if cmux is not available or no workspace matches.
 *
 * Uses Tauri's opener plugin for the fallback instead of window.open(),
 * because the async cmux call breaks the user-gesture context that
 * Tauri's webview requires for window.open() to work.
 */
export async function openDirectivLink(
  url: string,
  workspaceName: string,
): Promise<void> {
  try {
    const opened = await cmuxBrowserOpen(workspaceName, url);
    if (opened) return;
  } catch (err) {
    console.error("[cmuxLinks] browser_open failed, falling back:", err);
  }
  await openUrl(url);
}
