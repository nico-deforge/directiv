import { useEffect, useRef } from "react";
import { Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAuthStore, AUTH_PROVIDER_STATUS } from "../../stores/authStore";
import { useWorkspaceInit } from "../../hooks/useWorkspace";
import { useTerminalStore } from "../../stores/terminalStore";
import { TabBar } from "../Terminal/TabBar";
import { TerminalPanel } from "../Terminal/TerminalPanel";
import { LinearAuthGate } from "../Auth/LinearAuthGate";

export function RootLayout() {
  const loadFromDisk = useSettingsStore((s) => s.loadFromDisk);
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTab = useTerminalStore((s) => s.activeTab);
  const initializeLinearAuth = useAuthStore((s) => s.initializeLinearAuth);
  const linearStatus = useAuthStore((s) => s.linearStatus);
  const queryClient = useQueryClient();
  const prevStatusRef = useRef(linearStatus);

  useEffect(() => {
    loadFromDisk();
    initializeLinearAuth();
  }, [loadFromDisk, initializeLinearAuth]);

  // Invalidate Linear queries when auth status changes
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = linearStatus;
    if (prev === linearStatus) return;
    if (
      linearStatus === AUTH_PROVIDER_STATUS.CONNECTED ||
      linearStatus === AUTH_PROVIDER_STATUS.DISCONNECTED
    ) {
      queryClient.invalidateQueries({ queryKey: ["linear"] });
    }
  }, [linearStatus, queryClient]);

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
      <LinearAuthGate>
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
      </LinearAuthGate>
    </>
  );
}
