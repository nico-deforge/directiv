import { GitBranch } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { RepoWorktreeGroup } from "./RepoWorktreeGroup";

export function WorktreePanel() {
  const repos = useSettingsStore((s) => s.config.repos);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-900">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <GitBranch className="size-4" />
          Worktrees
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {repos.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <p className="text-center text-sm text-zinc-500">
              Configure <code className="text-zinc-400">repos</code> in settings.
            </p>
          </div>
        ) : (
          <div className="py-2">
            {repos.map((repo) => (
              <RepoWorktreeGroup key={repo.id} repo={repo} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
