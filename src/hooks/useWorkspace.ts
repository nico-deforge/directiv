import { useEffect, useMemo, useRef } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import type { WorkspaceConfig, DiscoveredRepo } from "../types";

export function useWorkspaceInit() {
  const workspaces = useSettingsStore((s) => s.config.workspaces);
  const isConfigLoaded = useSettingsStore((s) => s.isLoaded);
  const isHydrated = useWorkspaceStore((s) => s.isHydrated);
  const scanAllWorkspaces = useWorkspaceStore((s) => s.scanAllWorkspaces);
  const hasScanned = useRef(false);

  useEffect(() => {
    if (isConfigLoaded && isHydrated && workspaces.length > 0 && !hasScanned.current) {
      hasScanned.current = true;
      scanAllWorkspaces(workspaces);
    }
  }, [isConfigLoaded, isHydrated, workspaces, scanAllWorkspaces]);
}

export function useActiveWorkspace(): WorkspaceConfig | null {
  const workspaces = useSettingsStore((s) => s.config.workspaces);
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId);

  return useMemo(() => {
    if (!activeId) return workspaces[0] ?? null;
    return workspaces.find((ws) => ws.id === activeId) ?? null;
  }, [activeId, workspaces]);
}

export function useWorkspaceRepos(): DiscoveredRepo[] {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const repos = useWorkspaceStore((s) => s.repos);

  return useMemo(() => {
    if (!activeWorkspaceId) return repos;
    return repos.filter((r) => r.workspaceId === activeWorkspaceId);
  }, [activeWorkspaceId, repos]);
}

export function useAllRepos(): DiscoveredRepo[] {
  return useWorkspaceStore((s) => s.repos);
}

export function useWorkspaceSelector() {
  const workspaces = useSettingsStore((s) => s.config.workspaces);
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const showSelector = workspaces.length > 1;

  return { workspaces, activeId, setActiveWorkspace, showSelector };
}
