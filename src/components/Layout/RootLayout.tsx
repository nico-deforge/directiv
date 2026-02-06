import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWorkspaceInit } from "../../hooks/useWorkspace";

export function RootLayout() {
  const loadFromDisk = useSettingsStore((s) => s.loadFromDisk);
  const isLoaded = useSettingsStore((s) => s.isLoaded);

  useEffect(() => {
    loadFromDisk();
  }, [loadFromDisk]);

  // Initialize workspaces after config is loaded
  useWorkspaceInit();

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)] text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  return <Outlet />;
}
