import { FolderGit2, FolderOpen, Plus, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "../../stores/settingsStore";

export function WorkspacesSection() {
  const config = useSettingsStore((s) => s.config);
  const setConfig = useSettingsStore((s) => s.setConfig);

  async function handleAdd() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    const path = selected as string;
    if (config.workspaces.some((ws) => ws.path === path)) return;
    const name = path.split("/").pop() ?? path;
    setConfig({
      ...config,
      workspaces: [...config.workspaces, { id: name, path }],
    });
  }

  function handleRemove(path: string) {
    setConfig({
      ...config,
      workspaces: config.workspaces.filter((ws) => ws.path !== path),
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Workspaces
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Manage folders that Directiv scans for git repositories.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <FolderGit2 className="size-4 text-[var(--accent-blue)]" />
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            Workspace folders
          </h2>
          <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            {config.workspaces.length}
          </span>
        </div>

        <div className="space-y-2">
          {config.workspaces.map((ws) => (
            <div
              key={ws.path}
              className="flex items-center gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-3"
            >
              <FolderOpen className="size-4 shrink-0 text-[var(--accent-blue)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {ws.name ?? ws.id}
                </p>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {ws.path}
                </p>
              </div>
              <button
                onClick={() => handleRemove(ws.path)}
                className="shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-red)]"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}

          <button
            onClick={handleAdd}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-default)] px-4 py-3 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <Plus className="size-4" />
            Add workspace folder
          </button>
        </div>
      </section>
    </div>
  );
}
