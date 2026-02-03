import { useState, useEffect } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import {
  Terminal,
  Trash2,
  Loader2,
  GitBranch,
  Circle,
  FolderOpen,
  X,
} from "lucide-react";
import type { WorktreeInfo, TmuxSession } from "../../types";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWorktreeRemove } from "../../hooks/useWorktrees";
import { tmuxKillSession, openTerminal } from "../../lib/tauri";
import { useQueryClient } from "@tanstack/react-query";

export type OrphanTaskNodeData = {
  worktree: WorktreeInfo;
  session: TmuxSession | null;
  repoId: string;
  repoPath: string;
};

export type OrphanTaskNodeType = Node<OrphanTaskNodeData, "orphanTask">;

export function OrphanTaskCard({ data }: NodeProps<OrphanTaskNodeType>) {
  const { worktree, session, repoId, repoPath } = data;
  const terminal = useSettingsStore((s) => s.config.terminal);
  const removeWorktree = useWorktreeRemove();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [killingSession, setKillingSession] = useState(false);

  const hasSession = session !== null;
  const isDeleting = removeWorktree.isPending;

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  async function handleOpenTerminal() {
    if (!session) return;
    try {
      await openTerminal(terminal, session.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleKillSession() {
    if (!session) return;
    setKillingSession(true);
    try {
      await tmuxKillSession(worktree.branch);
      queryClient.invalidateQueries({ queryKey: ["tmux", "sessions"] });
    } catch {
      // Session may already be gone
    } finally {
      setKillingSession(false);
    }
  }

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    setError(null);

    // Kill tmux session first if exists
    try {
      await tmuxKillSession(worktree.branch);
    } catch {
      // Session may not exist
    }

    removeWorktree.mutate(
      { repoPath, worktreePath: worktree.path },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: ["tmux", "sessions"] }),
        onError: (err) =>
          setError(err instanceof Error ? err.message : String(err)),
      },
    );
  }

  const dirName = worktree.path.split("/").pop() ?? worktree.path;

  return (
    <div className="nodrag nopan w-[380px] rounded-lg border border-zinc-700 bg-zinc-800 shadow-lg">
      {/* Header: Branch info */}
      <div className="border-b border-zinc-700 px-3 py-2">
        <div className="flex items-start gap-2">
          <GitBranch className="mt-0.5 size-4 shrink-0 text-green-400" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-zinc-200">
                {worktree.branch}
              </span>
              {worktree.isDirty && (
                <span title="Uncommitted changes">
                  <Circle className="size-2 fill-yellow-400 text-yellow-400" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <FolderOpen className="size-3" />
              <span className="truncate">{dirName}</span>
              {(worktree.ahead > 0 || worktree.behind > 0) && (
                <span className="ml-1 flex items-center gap-1 text-zinc-400">
                  {worktree.ahead > 0 && <span>↑{worktree.ahead}</span>}
                  {worktree.behind > 0 && <span>↓{worktree.behind}</span>}
                </span>
              )}
            </div>
          </div>
          <span className="shrink-0 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {repoId}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Terminal button */}
        {hasSession && (
          <button
            onClick={handleOpenTerminal}
            className="flex items-center gap-1 rounded bg-zinc-700 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-600"
          >
            <Terminal className="size-3.5" />
            Terminal
          </button>
        )}

        {/* Kill session button */}
        {hasSession && (
          <button
            onClick={handleKillSession}
            disabled={killingSession}
            className="flex items-center gap-1 rounded bg-zinc-700 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
            title="Kill tmux session"
          >
            {killingSession ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
            Kill Session
          </button>
        )}

        {/* Delete worktree button */}
        {confirmingDelete ? (
          <span className="flex items-center gap-2 text-xs">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-red-400 hover:text-red-300"
            >
              {isDeleting ? "Deleting..." : "Confirm"}
            </button>
            <span className="text-zinc-600">/</span>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-1 rounded bg-red-600/50 px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-600/70 disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Delete
          </button>
        )}
      </div>

      {/* Error message */}
      {error && <p className="px-3 pb-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
