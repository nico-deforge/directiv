import { useState, useEffect } from "react";
import { toastError } from "../../lib/toast";
import type { Node, NodeProps } from "@xyflow/react";
import {
  Terminal,
  Trash2,
  Loader2,
  GitBranch,
  Github,
  Circle,
  SquareKanban,
  ExternalLink,
  X,
  Code2,
} from "lucide-react";
import type { WorktreeInfo, TmuxSession, PullRequestInfo } from "../../types";
import { useSettingsStore } from "../../stores/settingsStore";
import type { LinearIssueStub } from "../../hooks/useLinear";
import { useWorktreeRemove } from "../../hooks/useWorktrees";
import { tmuxKillSession, openTerminal, openEditor } from "../../lib/tauri";
import { toSessionName } from "../../lib/tmux-utils";
import { useQueryClient } from "@tanstack/react-query";

export type OrphanTaskNodeData = {
  worktree: WorktreeInfo;
  session: TmuxSession | null;
  repoId: string;
  repoPath: string;
  pullRequest: PullRequestInfo | null;
  linearIssue: LinearIssueStub | null;
};

export type OrphanTaskNodeType = Node<OrphanTaskNodeData, "orphanTask">;

export function OrphanTaskCard({ data }: NodeProps<OrphanTaskNodeType>) {
  const { worktree, session, repoId, repoPath, pullRequest, linearIssue } =
    data;
  const terminal = useSettingsStore((s) => s.config.terminal);
  const editor = useSettingsStore((s) => s.config.editor);
  const removeWorktree = useWorktreeRemove();
  const queryClient = useQueryClient();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [killingSession, setKillingSession] = useState(false);

  const hasSession = session !== null;
  const isDeleting = removeWorktree.isPending;

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
      toastError(err);
    }
  }

  async function handleOpenEditor() {
    try {
      await openEditor(editor, worktree.path);
    } catch (err) {
      toastError(err);
    }
  }

  async function handleKillSession() {
    if (!session) return;
    setKillingSession(true);
    try {
      await tmuxKillSession(toSessionName(worktree.branch));
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

    // Kill tmux session first if exists
    try {
      await tmuxKillSession(toSessionName(worktree.branch));
    } catch {
      // Session may not exist
    }

    removeWorktree.mutate(
      { repoPath, worktreePath: worktree.path },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: ["tmux", "sessions"] }),
        onError: (err) => toastError(err),
      },
    );
  }

  return (
    <div className="nodrag nopan w-[380px] rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] shadow-lg">
      {/* Header */}
      <div className="border-b border-[var(--border-default)] px-3 py-2">
        <div className="flex items-center gap-2">
          {linearIssue ? (
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {linearIssue.identifier}
            </span>
          ) : (
            <GitBranch className="size-4 shrink-0 text-[var(--accent-green)]" />
          )}
          <span className="ml-auto shrink-0 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
            {repoId}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-[var(--text-primary)]">
          {linearIssue ? linearIssue.title : worktree.branch}
        </p>
      </div>

      {/* Linear Section */}
      {linearIssue && (
        <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-3 py-2">
          <SquareKanban className="size-4 shrink-0 text-[var(--accent-blue)]" />
          <a
            href={linearIssue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 min-w-0 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <span className="truncate">{linearIssue.identifier}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
          <span className="ml-auto text-xs text-[var(--text-tertiary)]">
            {linearIssue.status}
          </span>
        </div>
      )}

      {/* Worktree Section */}
      <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-3 py-2">
        <GitBranch className="size-4 shrink-0 text-[var(--accent-green)]" />
        <span className="truncate text-sm text-[var(--text-secondary)]">
          {worktree.branch}
        </span>
        {worktree.isDirty && (
          <span title="Uncommitted changes">
            <Circle className="size-2 fill-[var(--accent-yellow)] text-[var(--accent-yellow)]" />
          </span>
        )}
        {(worktree.ahead > 0 || worktree.behind > 0) && (
          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            {worktree.ahead > 0 && <span>↑{worktree.ahead}</span>}
            {worktree.behind > 0 && <span>↓{worktree.behind}</span>}
          </span>
        )}
      </div>

      {/* PR Section */}
      {pullRequest && (
        <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-3 py-2">
          <Github className="size-4 shrink-0 text-[var(--accent-purple)]" />
          <a
            href={pullRequest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 min-w-0 flex-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <span className="truncate">PR #{pullRequest.number}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Terminal button */}
        {hasSession && (
          <button
            onClick={handleOpenTerminal}
            className="flex items-center gap-1 rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:opacity-80"
          >
            <Terminal className="size-3.5" />
            Terminal
          </button>
        )}

        {/* Editor button */}
        <button
          onClick={handleOpenEditor}
          className="flex items-center gap-1 rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:opacity-80"
        >
          <Code2 className="size-3.5" />
          Editor
        </button>

        {/* Kill session button */}
        {hasSession && (
          <button
            onClick={handleKillSession}
            disabled={killingSession}
            className="flex items-center gap-1 rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:opacity-80 disabled:opacity-50"
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
              className="text-[var(--accent-red)] hover:opacity-80"
            >
              {isDeleting ? "Deleting..." : "Confirm"}
            </button>
            <span className="text-[var(--text-muted)]">/</span>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-1 rounded bg-[var(--accent-red)]/20 px-2 py-1 text-xs font-medium text-[var(--accent-red)] hover:bg-[var(--accent-red)]/30 disabled:opacity-50"
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
    </div>
  );
}
