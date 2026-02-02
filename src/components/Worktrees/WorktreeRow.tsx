import { useState, useEffect } from "react";
import {
  GitBranch,
  Trash2,
  Loader2,
  FolderOpen,
  Circle,
  Terminal,
} from "lucide-react";
import { useWorktreeRemove } from "../../hooks/useWorktrees";
import { tmuxKillSession } from "../../lib/tauri";
import { useQueryClient } from "@tanstack/react-query";
import type { WorktreeInfo, TmuxSession } from "../../types";

interface WorktreeRowProps {
  worktree: WorktreeInfo;
  repoPath: string;
  session: TmuxSession | null;
}

export function WorktreeRow({ worktree, repoPath, session }: WorktreeRowProps) {
  const { branch, path, isDirty, ahead, behind } = worktree;
  const dirName = path.split("/").pop() ?? path;
  const remove = useWorktreeRemove();
  const queryClient = useQueryClient();
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

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setError(null);
    // Kill tmux session if one exists for this branch
    try {
      await tmuxKillSession(branch);
    } catch {
      // Session may not exist — ignore
    }
    remove.mutate(
      { repoPath, worktreePath: path },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: ["tmux", "sessions"] }),
        onError: (err) =>
          setError(err instanceof Error ? err.message : String(err)),
      },
    );
  }

  const isDeleting = remove.isPending;

  return (
    <div className="group">
      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/50 rounded-md">
        <GitBranch className="size-3.5 shrink-0 text-zinc-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="block truncate text-sm text-zinc-300">
              {branch}
            </span>
            {isDirty && (
              <span title="Uncommitted changes">
                <Circle className="size-2 shrink-0 fill-yellow-400 text-yellow-400" />
              </span>
            )}
          </div>
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <FolderOpen className="size-3 shrink-0" />
            <span className="truncate">{dirName}</span>
            {(ahead > 0 || behind > 0) && (
              <span className="ml-1 flex items-center gap-1 text-[10px] text-zinc-400">
                {ahead > 0 && (
                  <span title={`${ahead} commit(s) ahead`}>↑{ahead}</span>
                )}
                {behind > 0 && (
                  <span title={`${behind} commit(s) behind`}>↓{behind}</span>
                )}
              </span>
            )}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {session && (
            <span
              title={`tmux: ${session.attached ? "attached" : "detached"} (${session.windows} window${session.windows !== 1 ? "s" : ""})`}
            >
              <Terminal
                className={`size-3.5 ${session.attached ? "text-green-400" : "text-amber-400"}`}
              />
            </span>
          )}
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
