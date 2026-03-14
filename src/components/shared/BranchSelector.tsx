import { GitBranch, ChevronLeft, AlertTriangle } from "lucide-react";
import { useWorktrees } from "../../hooks/useWorktrees";

export function BranchSelector({
  repoPath,
  repoId,
  configWarning,
  onSelect,
  onBack,
}: {
  repoPath: string;
  repoId?: string;
  configWarning?: string;
  onSelect: (baseBranch?: string) => void;
  onBack?: () => void;
}) {
  const { data: worktrees } = useWorktrees(repoPath);
  const availableBranches =
    worktrees
      ?.slice(1)
      .map((wt) => wt.branch)
      .filter(Boolean) ?? [];

  return (
    <div className="min-w-48">
      {configWarning && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--accent-amber)]">
          <AlertTriangle className="size-3 shrink-0" />
          <span className="line-clamp-2">.directiv.json error</span>
        </div>
      )}
      {onBack && (
        <button
          role="menuitem"
          onClick={onBack}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeft className="size-3" />
          {repoId ?? "Back"}
        </button>
      )}
      <button
        role="menuitem"
        onClick={() => onSelect(undefined)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
      >
        <GitBranch className="size-3 text-[var(--text-muted)]" />
        Default (main)
      </button>
      {availableBranches.length > 0 && (
        <>
          <div className="mx-2 my-1 border-t border-[var(--border-default)]" />
          <div className="px-2 py-1 text-xs text-[var(--text-muted)]">
            From worktree
          </div>
          {availableBranches.map((branch) => (
            <button
              key={branch}
              role="menuitem"
              onClick={() => onSelect(branch)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <GitBranch className="size-3 text-[var(--accent-green)]" />
              <span className="truncate">{branch}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
