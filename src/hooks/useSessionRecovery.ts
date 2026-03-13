import { useEffect, useRef } from "react";
import { tmuxListSessions } from "../lib/tauri";
import { useTerminalStore } from "../stores/terminalStore";
import { useSettingsStore } from "../stores/settingsStore";

/** Pattern matching Directiv-created tmux session names (e.g. "ACQ-145"). */
const DIRECTIV_SESSION_RE = /^[A-Z]+-\d+$/;

/**
 * Runs once at startup: scans active tmux sessions, identifies those matching
 * the Directiv naming pattern, and registers them as internal terminal tabs
 * (only when terminalMode is "internal"). For external mode, the indicator
 * hook (useTerminalStatuses) handles board state via queryTerminals.
 */
export function useSessionRecovery() {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const terminalMode = useSettingsStore.getState().config.terminalMode;
    if (terminalMode === "external") return;

    tmuxListSessions()
      .then((sessions) => {
        let recovered = 0;

        for (const session of sessions) {
          if (!DIRECTIV_SESSION_RE.test(session.name)) continue;

          useTerminalStore.getState().registerSession({
            sessionName: session.name,
            identifier: session.name,
            title: session.name,
          });
          recovered++;
        }

        if (recovered > 0) {
          console.log(
            `[directiv] Session recovery: restored ${recovered} session(s)`,
          );
        }
      })
      .catch((err) => {
        console.warn("[directiv] Session recovery failed:", err);
      });
  }, []);
}
