import type { WorkspaceConfig } from "../../../types";
import { WorkspaceList } from "../../shared/WorkspaceList";

export function WorkspacesStep({
  workspaces,
  onChange,
}: {
  workspaces: WorkspaceConfig[];
  onChange: (workspaces: WorkspaceConfig[]) => void;
}) {
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

      <WorkspaceList workspaces={workspaces} onChange={onChange} />
    </div>
  );
}
