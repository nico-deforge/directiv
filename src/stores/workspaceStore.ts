import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WorkspaceConfig, DiscoveredRepo } from "../types";
import { scanWorkspace } from "../lib/tauri";

interface WorkspaceState {
  activeWorkspaceId: string | null;
  repos: DiscoveredRepo[];
  isScanning: boolean;
  isHydrated: boolean;
  error: string | null;

  setActiveWorkspace: (id: string) => void;
  scanAllWorkspaces: (workspaces: WorkspaceConfig[]) => Promise<void>;
  setHydrated: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      activeWorkspaceId: null,
      repos: [],
      isScanning: false,
      isHydrated: false,
      error: null,

      setActiveWorkspace: (id: string) => {
        set({ activeWorkspaceId: id });
      },

      scanAllWorkspaces: async (workspaces: WorkspaceConfig[]) => {
        // Prevent concurrent scans
        if (get().isScanning) return;

        if (workspaces.length === 0) {
          set({ repos: [], isScanning: false });
          return;
        }

        set({ isScanning: true, error: null });

        try {
          const allRepos: DiscoveredRepo[] = [];

          for (const ws of workspaces) {
            try {
              const repos = await scanWorkspace(ws.path, ws.id);
              allRepos.push(...repos);
            } catch (err) {
              console.warn(`Failed to scan workspace ${ws.id}:`, err);
            }
          }

          // Auto-select first workspace if none selected
          const currentActive = get().activeWorkspaceId;
          const activeValid = workspaces.some((ws) => ws.id === currentActive);

          set({
            repos: allRepos,
            isScanning: false,
            activeWorkspaceId: activeValid
              ? currentActive
              : (workspaces[0]?.id ?? null),
          });
        } catch (err) {
          set({
            isScanning: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },

      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: "directiv-workspace",
      partialize: (state) => ({ activeWorkspaceId: state.activeWorkspaceId }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
