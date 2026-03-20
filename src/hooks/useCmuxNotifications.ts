import { useQuery } from "@tanstack/react-query";
import { cmuxListNotifications, type CmuxNotification } from "../lib/tauri";
import { useSettingsStore } from "../stores/settingsStore";
import { LOCAL_REFRESH_INTERVAL } from "../constants/intervals";

/**
 * Poll cmux for agent state notifications when cmux is the configured terminal backend.
 *
 * Returns a map from workspace_id to the most recent notification for that workspace.
 * When multiple notifications exist for the same workspace, the last one wins
 * (cmux returns them in order; the last is assumed most recent).
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
      const byWorkspace = new Map<string, CmuxNotification>();
      for (const n of notifications) {
        byWorkspace.set(n.workspaceId, n);
      }
      return byWorkspace;
    },
    enabled: isCmux,
    refetchInterval: LOCAL_REFRESH_INTERVAL,
  });

  return data ?? new Map();
}
