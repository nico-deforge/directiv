import { Loader2 } from "lucide-react";
import { useWorktrees } from "../../hooks/useWorktrees";
import { WorktreeRow } from "./WorktreeRow";
import type { RepoConfig, TmuxSession } from "../../types";

interface RepoWorktreeGroupProps {
  repo: RepoConfig;
  sessionsByName: Map<string, TmuxSession>;
}

export function RepoWorktreeGroup({
  repo,
  sessionsByName,
}: RepoWorktreeGroupProps) {
  const {
    data: worktrees,
    isLoading,
    isError,
    error,
  } = useWorktrees(repo.path);

  // Filter out the main worktree (always first in git worktree list output)
  const secondary = worktrees?.slice(1) ?? [];

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-zinc-900 px-4 py-2">
        <span className="text-xs font-medium text-zinc-400">{repo.id}</span>
        {!isLoading && !isError && (
          <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
            {secondary.length}
          </span>
        )}
      </div>
      <div className="px-1">
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-4 text-zinc-500 animate-spin" />
          </div>
        )}
        {isError && (
          <p className="px-3 py-2 text-xs text-red-400">
            {error instanceof Error
              ? error.message
              : "Failed to load worktrees"}
          </p>
        )}
        {!isLoading && !isError && secondary.length === 0 && (
          <p className="px-3 py-2 text-xs text-zinc-500">No active worktrees</p>
        )}
        {secondary.map((w) => (
          <WorktreeRow
            key={w.branch}
            worktree={w}
            repoPath={repo.path}
            session={sessionsByName.get(w.branch) ?? null}
          />
        ))}
      </div>
    </div>
  );
}
