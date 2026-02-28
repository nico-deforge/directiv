import { FolderOpen, Plus, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { WorkspaceConfig } from "../../../types";

export function WorkspacesStep({
  workspaces,
  onChange,
}: {
  workspaces: WorkspaceConfig[];
  onChange: (workspaces: WorkspaceConfig[]) => void;
}) {
  async function handleAdd() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    const path = selected as string;
    if (workspaces.some((ws) => ws.path === path)) return;
    const name = path.split("/").pop() ?? path;
    onChange([...workspaces, { id: name, path }]);
  }

  function handleRemove(path: string) {
    onChange(workspaces.filter((ws) => ws.path !== path));
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Add your workspaces
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Select folders that contain your git repositories. Directiv will scan
          them to discover repos.
        </p>
      </div>

      <div className="space-y-2">
        {workspaces.map((ws) => (
          <div
            key={ws.path}
            className="flex items-center gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-3"
          >
            <FolderOpen className="size-4 shrink-0 text-[var(--accent-blue)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {ws.id}
              </p>
              <p className="truncate text-xs text-[var(--text-muted)]">
                {ws.path}
              </p>
            </div>
            <button
              onClick={() => handleRemove(ws.path)}
              className="shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={handleAdd}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-default)] px-4 py-3 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <Plus className="size-4" />
        Add workspace folder
      </button>
    </div>
  );
}
