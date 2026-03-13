import { useQuery } from "@tanstack/react-query";
import { queryTerminals } from "../lib/tauri";
import { useSettingsStore } from "../stores/settingsStore";
import type { TerminalStatus } from "../types";
import { LOCAL_REFRESH_INTERVAL } from "../constants/intervals";

export function useTerminalStatuses() {
  const terminal = useSettingsStore((s) => s.config.terminal);
  const terminalMode = useSettingsStore((s) => s.config.terminalMode);

  const query = useQuery<TerminalStatus[]>({
    queryKey: ["terminal-statuses", terminal],
    queryFn: () => queryTerminals(terminal),
    enabled: terminalMode === "external",
    refetchInterval: LOCAL_REFRESH_INTERVAL,
  });

  const statusMap = new Map<string, boolean>();
  if (query.data) {
    for (const status of query.data) {
      statusMap.set(status.sessionName, status.active);
    }
  }

  return { statusMap, isExternalMode: terminalMode === "external" };
}
