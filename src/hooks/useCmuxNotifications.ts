import { useQuery } from "@tanstack/react-query";
import { cmuxListNotifications, type CmuxNotification } from "../lib/tauri";
import { useSettingsStore } from "../stores/settingsStore";
import { LOCAL_REFRESH_INTERVAL } from "../constants/intervals";

const EMPTY_MAP = new Map<string, CmuxNotification>();

/**
 * Poll cmux for agent state notifications when cmux is the configured terminal backend.
 *
 * Returns a map from task identifier (e.g. "ACQ-145") to the most recent notification.
 * The backend resolves workspace UUIDs to identifiers via the workspace tree.
 * When multiple notifications exist for the same workspace, the last one wins.
 *
 * Only polls when cmux is the active terminal backend. Returns an empty map otherwise.
 * Polling interval matches LOCAL_REFRESH_INTERVAL (5s) for consistency with tmux polling.
 */
export function useCmuxNotifications(): Map<string, CmuxNotification> {
  const terminal = useSettingsStore((s) => s.config.terminal);
  const isCmux = terminal === "cmux";

  const { data } = useQuery<Map<string, CmuxNotification>>({
    queryKey: ["cmux", "notifications"],
    queryFn: async () => {
      const notifications = await cmuxListNotifications();
      const byIdentifier = new Map<string, CmuxNotification>();
      for (const n of notifications) {
        byIdentifier.set(n.workspaceName, n);
      }
      return byIdentifier;
    },
    enabled: isCmux,
    refetchInterval: LOCAL_REFRESH_INTERVAL,
  });

  return data ?? EMPTY_MAP;
}
