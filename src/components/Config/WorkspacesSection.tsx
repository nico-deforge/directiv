import { FolderGit2 } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { WorkspaceList } from "../shared/WorkspaceList";

export function WorkspacesSection() {
  const config = useSettingsStore((s) => s.config);
  const setConfig = useSettingsStore((s) => s.setConfig);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
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

        <WorkspaceList
          workspaces={config.workspaces}
          onChange={(workspaces) => setConfig({ ...config, workspaces })}
        />
      </section>
    </div>
  );
}
