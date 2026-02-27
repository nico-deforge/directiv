import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAuthStore, AUTH_PROVIDER_STATUS } from "../../stores/authStore";
import { useWorkspaceInit } from "../../hooks/useWorkspace";
import { useTerminalStore } from "../../stores/terminalStore";
import { TabBar } from "../Terminal/TabBar";
import { TerminalPanel } from "../Terminal/TerminalPanel";
import { AuthGate } from "../Auth/AuthGate";

export function RootLayout() {
  const loadFromDisk = useSettingsStore((s) => s.loadFromDisk);
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTab = useTerminalStore((s) => s.activeTab);
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
      <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)] text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  return (
    <>
      <Toaster theme={resolvedTheme} richColors position="bottom-right" />
      <AuthGate>
        <div className="flex h-screen flex-col">
          <TabBar />
          <div
            className={
              activeTab === "board"
                ? "min-h-0 flex-1 overflow-hidden"
                : "hidden"
            }
          >
            <Outlet />
          </div>
          {tabs.map((tab) => (
            <div
              key={tab.sessionName}
              className={
                activeTab === tab.sessionName
                  ? "min-h-0 flex-1 overflow-hidden"
                  : "hidden"
              }
            >
              <TerminalPanel
                sessionName={tab.sessionName}
                isActive={activeTab === tab.sessionName}
              />
            </div>
          ))}
        </div>
      </AuthGate>
    </>
  );
}
