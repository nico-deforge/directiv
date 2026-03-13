import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryTerminals } from "../lib/tauri";
import { useSettingsStore } from "../stores/settingsStore";
import type { TerminalStatus } from "../types";
import { LOCAL_REFRESH_INTERVAL } from "../constants/intervals";

export function useTerminalStatuses() {
  const terminal = useSettingsStore((s) => s.config.terminal);

  const query = useQuery<TerminalStatus[]>({
    queryKey: ["terminal-statuses", terminal],
    queryFn: () => queryTerminals(terminal),
    refetchInterval: LOCAL_REFRESH_INTERVAL,
  });

  const statusMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (query.data) {
      for (const status of query.data) {
        map.set(status.sessionName, status.active);
      }
    }
    return map;
  }, [query.data]);

  return { statusMap };
}
