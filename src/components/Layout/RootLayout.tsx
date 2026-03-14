import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAuthStore, AUTH_PROVIDER_STATUS } from "../../stores/authStore";
import { useWorkspaceInit } from "../../hooks/useWorkspace";
import { AuthGate } from "../Auth/AuthGate";
import { OnboardingGate } from "../Onboarding/OnboardingGate";
import { CommandPalette } from "./CommandPalette";
import { Skeleton } from "../shared/Skeleton";

export function RootLayout() {
  const loadFromDisk = useSettingsStore((s) => s.loadFromDisk);
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const initializeLinearAuth = useAuthStore((s) => s.initializeLinearAuth);
  const initializeGitHubAuth = useAuthStore((s) => s.initializeGitHubAuth);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadFromDisk();
    initializeLinearAuth();
    initializeGitHubAuth();
  }, [loadFromDisk, initializeLinearAuth, initializeGitHubAuth]);

  // Invalidate queries when auth status transitions to connected or disconnected
  useEffect(() => {
    const providers: Array<{
      getStatus: (s: ReturnType<typeof useAuthStore.getState>) => string;
      queryKey: string;
    }> = [
      { getStatus: (s) => s.linearStatus, queryKey: "linear" },
      { getStatus: (s) => s.githubStatus, queryKey: "github" },
    ];

    const prevStatuses = providers.map((p) =>
      p.getStatus(useAuthStore.getState()),
    );

    const unsub = useAuthStore.subscribe((state) => {
      for (let i = 0; i < providers.length; i++) {
        const status = providers[i].getStatus(state);
        if (status !== prevStatuses[i]) {
          prevStatuses[i] = status;
          if (
            status === AUTH_PROVIDER_STATUS.CONNECTED ||
            status === AUTH_PROVIDER_STATUS.DISCONNECTED
          ) {
            queryClient.invalidateQueries({
              queryKey: [providers[i].queryKey],
            });
          }
        }
      }
    });
    return unsub;
  }, [queryClient]);

  // Initialize workspaces after config is loaded
  useWorkspaceInit();

  if (!isLoaded) {
    return (
      <>
        {/* Window drag region — replaces native title bar (titleBarStyle: overlay).
            Removing this makes the window undraggable. */}
        <div
          data-tauri-drag-region
          className="fixed left-0 right-0 top-0 z-50 h-7"
        />
        <div className="flex h-screen bg-[var(--bg-primary)]">
          {/* Sidebar skeleton */}
          <div className="flex w-[200px] shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-4 gap-2">
            <Skeleton height={28} className="mb-2" />
            <Skeleton height={16} width="60%" />
            <Skeleton height={16} width="80%" />
            <Skeleton height={16} width="70%" />
            <Skeleton height={16} width="50%" />
          </div>
          {/* Canvas skeleton */}
          <div className="flex flex-1 flex-col gap-4 p-8">
            <div className="flex gap-4">
              <Skeleton width={220} height={100} />
              <Skeleton width={220} height={100} />
              <Skeleton width={220} height={100} />
            </div>
            <div className="flex gap-4 pl-16">
              <Skeleton width={220} height={100} />
              <Skeleton width={220} height={100} />
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Window drag region — replaces native title bar (titleBarStyle: overlay).
          Removing this makes the window undraggable. */}
      <div
        data-tauri-drag-region
        className="fixed left-0 right-0 top-0 z-50 h-7"
      />
      <Toaster theme={resolvedTheme} richColors position="bottom-right" />
      <CommandPalette />
      <AuthGate>
        <OnboardingGate>
          <div className="flex h-screen flex-col">
            <div className="h-7 shrink-0" />
            <div className="min-h-0 flex-1 overflow-hidden">
              <Outlet />
            </div>
          </div>
        </OnboardingGate>
      </AuthGate>
    </>
  );
}
