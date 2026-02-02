import { useState, useEffect } from "react";
import { GitBranch, Trash2, Loader2, FolderOpen } from "lucide-react";
import { useWorktreeRemove } from "../../hooks/useWorktrees";
import type { WorktreeInfo } from "../../types";

interface WorktreeRowProps {
  worktree: WorktreeInfo;
  repoPath: string;
}

export function WorktreeRow({ worktree, repoPath }: WorktreeRowProps) {
  const { branch, path } = worktree;
  const dirName = path.split("/").pop() ?? path;
  const remove = useWorktreeRemove();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setError(null);
    remove.mutate(
      { repoPath, worktreePath: path },
      { onError: (err) => setError(err instanceof Error ? err.message : String(err)) },
    );
  }

  const isDeleting = remove.isPending;

  return (
    <div className="group">
      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/50 rounded-md">
        <GitBranch className="size-3.5 shrink-0 text-zinc-500" />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm text-zinc-300">{branch}</span>
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <FolderOpen className="size-3 shrink-0" />
            <span className="truncate">{dirName}</span>
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {confirming ? (
            <>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Confirm
              </button>
              <span className="text-xs text-zinc-600">/</span>
              <button
                onClick={() => setConfirming(false)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
            </>
          ) : isDeleting ? (
            <Loader2 className="size-4 text-zinc-400 animate-spin" />
          ) : (
            <button
              onClick={handleDelete}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-700"
              title="Remove worktree"
            >
              <Trash2 className="size-3.5 text-zinc-500 hover:text-red-400" />
            </button>
          )}
        </div>
      </div>
      {error && <p className="px-3 pb-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
