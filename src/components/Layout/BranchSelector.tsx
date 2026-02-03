import { ChevronLeft, GitBranch } from "lucide-react";
import { useWorktrees } from "../../hooks/useWorktrees";

interface BranchSelectorProps {
  repoPath: string;
  repoId?: string;
  onSelect: (baseBranch?: string) => void;
  onBack?: () => void;
}

export function BranchSelector({
  repoPath,
  repoId,
  onSelect,
  onBack,
}: BranchSelectorProps) {
  const { data: worktrees } = useWorktrees(repoPath);

  // Filter out the main worktree (index 0) and get branches from other worktrees
  const availableBranches =
    worktrees?.slice(1).map((wt) => wt.branch).filter(Boolean) ?? [];

  return (
    <div className="min-w-48">
      {onBack && (
        <button
          onClick={onBack}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
        >
          <ChevronLeft className="size-3" />
          {repoId ?? "Back"}
        </button>
      )}
      <button
        onClick={() => onSelect(undefined)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-700"
      >
        <GitBranch className="size-3 text-zinc-500" />
        Default (main)
      </button>
      {availableBranches.length > 0 && (
        <>
          <div className="mx-2 my-1 border-t border-zinc-700" />
          <div className="px-2 py-1 text-xs text-zinc-500">From worktree</div>
          {availableBranches.map((branch) => (
            <button
              key={branch}
              onClick={() => onSelect(branch)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-700"
            >
              <GitBranch className="size-3 text-green-500" />
              <span className="truncate">{branch}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
