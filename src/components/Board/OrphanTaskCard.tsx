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
  X,
  Code2,
  MoreHorizontal,
} from "lucide-react";
import type { WorktreeInfo, TmuxSession, PullRequestInfo } from "../../types";
import { CIStatusIcon } from "./CIStatusIcon";
import { useSettingsStore } from "../../stores/settingsStore";
import type { LinearIssueStub } from "../../hooks/useLinear";
import { useWorktreeRemove } from "../../hooks/useWorktrees";
import { useWorkspaceRepos } from "../../hooks/useWorkspace";
import {
  tmuxKillSession,
  tmuxCreateSession,
  tmuxWaitForReady,
  tmuxSendKeys,
  openTerminal,
  openEditor,
  worktreeCheckBranchSynced,
} from "../../lib/tauri";
import {
  buildClaudeCommand,
  openTerminalWithToast,
  HookFailedError,
} from "../../lib/workflows";
import { toSessionName } from "../../lib/tmux-utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../shared/DropdownMenu";
import { TooltipProvider, Tooltip } from "../shared/Tooltip";

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
  const repos = useWorkspaceRepos();
  const queryClient = useQueryClient();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [killingSession, setKillingSession] = useState(false);
  const [launchingSession, setLaunchingSession] = useState(false);
  const [hasUnpushed, setHasUnpushed] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);

  const hasSession = session !== null;
  const isDeleting = removeWorktree.isPending;

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => {
      setConfirmingDelete(false);
      setHasUnpushed(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  async function handleLaunchSession() {
    const sessionName = toSessionName(worktree.branch);
    setLaunchingSession(true);
    try {
      await tmuxCreateSession(sessionName, worktree.path);
      await tmuxWaitForReady(sessionName);
      const cmd = await buildClaudeCommand();
      await tmuxSendKeys(sessionName, cmd);
      const { terminalLayout } = useSettingsStore.getState().config;
      await openTerminal(
        terminal,
        sessionName,
        worktree.branch,
        worktree.path,
        terminalLayout,
      );
      queryClient.invalidateQueries({ queryKey: ["tmux", "sessions"] });
    } catch (err) {
      toastError(err);
    } finally {
      setLaunchingSession(false);
    }
  }

  function handleOpenTerminal() {
    if (!session) return;
    const { terminalLayout } = useSettingsStore.getState().config;
    openTerminalWithToast(
      terminal,
      session.name,
      worktree.branch,
      worktree.path,
      terminalLayout,
    );
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

  async function handleDelete(skipHooks = false) {
    if (!skipHooks && !confirmingDelete) {
      // First click: check for unpushed commits, then show confirmation
      setConfirmingDelete(true);
      try {
        const synced = await worktreeCheckBranchSynced(
          repoPath,
          worktree.branch,
        );
        setHasUnpushed(!synced);
      } catch {
        setHasUnpushed(false);
      }
      return;
    }
    setConfirmingDelete(false);
    setHasUnpushed(false);
    setHookError(null);

    const repo = repos.find((r) => r.path === repoPath);
    removeWorktree.mutate(
      {
        repoPath,
        worktreePath: worktree.path,
        branch: worktree.branch,
        deleteBranch: true,
        sessionName: session ? toSessionName(worktree.branch) : undefined,
        beforeRemove: repo?.beforeRemove,
        skipHooks,
      },
      {
        onError: (err) => {
          if (err instanceof HookFailedError) {
            setHookError(err.message);
          } else {
            toastError(err);
          }
        },
      },
    );
  }

  return (
    <TooltipProvider>
      <div className="nodrag nopan w-[380px] rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] shadow-lg">
        {/* Header */}
        <div className="border-b border-[var(--border-default)] px-3 py-2.5">
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

        {/* Meta row: compact icon links */}
        <div className="flex items-center gap-3 border-b border-[var(--border-default)] px-3 py-1.5">
          {/* Linear link */}
          {linearIssue && (
            <Tooltip
              content={`Linear · ${linearIssue.identifier} · ${linearIssue.status}`}
            >
              <a
                href={linearIssue.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent-blue)] transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <SquareKanban className="size-3.5 shrink-0" />
                <span className="text-xs">{linearIssue.identifier}</span>
              </a>
            </Tooltip>
          )}

          {/* PR link */}
          {pullRequest && (
            <Tooltip
              content={`PR #${pullRequest.number} · ${pullRequest.title ?? ""}`}
            >
              <a
                href={pullRequest.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent-purple)] transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <Github className="size-3.5 shrink-0" />
                <span className="text-xs">#{pullRequest.number}</span>
              </a>
            </Tooltip>
          )}

          {/* CI status */}
          {pullRequest && (
            <CIStatusIcon
              status={pullRequest.ciStatus}
              url={pullRequest.ciUrl}
            />
          )}

          {/* Branch info */}
          <Tooltip content={`Branch: ${worktree.branch}`}>
            <span className="ml-auto flex items-center gap-1 text-[var(--text-muted)]">
              <GitBranch className="size-3.5 shrink-0 text-[var(--accent-green)]" />
              <span className="max-w-[120px] truncate text-xs">
                {worktree.branch}
              </span>
              {worktree.isDirty && (
                <Circle className="size-1.5 fill-[var(--accent-yellow)] text-[var(--accent-yellow)]" />
              )}
              {(worktree.ahead > 0 || worktree.behind > 0) && (
                <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-muted)]">
                  {worktree.ahead > 0 && <span>↑{worktree.ahead}</span>}
                  {worktree.behind > 0 && <span>↓{worktree.behind}</span>}
                </span>
              )}
            </span>
          </Tooltip>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Terminal / Launch button — primary action */}
          {hasSession ? (
            <button
              onClick={handleOpenTerminal}
              className="flex items-center gap-1.5 rounded bg-[var(--bg-elevated)] px-2 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:opacity-80"
            >
              <Terminal className="size-3.5" />
              Terminal
            </button>
          ) : (
            <button
              onClick={handleLaunchSession}
              disabled={launchingSession}
              // text-white intentional: sufficient contrast on accent-green in light mode (5:1 AA)
              className="flex flex-1 items-center justify-center gap-1.5 rounded bg-[var(--accent-green)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {launchingSession ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Terminal className="size-3.5" />
              )}
              Launch Claude
            </button>
          )}

          {/* Secondary actions in "..." dropdown */}
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button
                className="ml-auto flex items-center rounded bg-[var(--bg-elevated)] px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                title="More actions"
                aria-label="More actions"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuItem onSelect={handleOpenEditor} className="gap-2">
                <Code2 className="size-3.5 text-[var(--text-muted)]" />
                Open in Editor
              </DropdownMenuItem>
              {hasSession && (
                <DropdownMenuItem
                  onSelect={handleKillSession}
                  disabled={killingSession}
                  className="gap-2"
                >
                  {killingSession ? (
                    <Loader2 className="size-3.5 animate-spin text-[var(--text-muted)]" />
                  ) : (
                    <X className="size-3.5 text-[var(--text-muted)]" />
                  )}
                  Kill Session
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => handleDelete()}
                disabled={isDeleting || confirmingDelete}
                className="gap-2 text-[var(--accent-red)] focus:text-[var(--accent-red)]"
              >
                {isDeleting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Delete Worktree
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuRoot>
        </div>

        {/* Delete confirmation inline */}
        {confirmingDelete && (
          <div className="border-t border-[var(--border-default)] px-3 py-2">
            <span className="flex items-center gap-2 text-xs">
              {hasUnpushed && (
                <span className="text-[var(--accent-amber)]">
                  Unpushed commits!
                </span>
              )}
              <span className="text-[var(--text-muted)]">Delete worktree?</span>
              <button
                onClick={() => handleDelete()}
                disabled={isDeleting}
                className="rounded px-2 py-1 text-[var(--accent-red)] hover:opacity-80 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Yes"}
              </button>
              <span className="text-[var(--text-muted)]">/</span>
              <button
                onClick={() => {
                  setConfirmingDelete(false);
                  setHasUnpushed(false);
                }}
                className="rounded px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                No
              </button>
            </span>
          </div>
        )}

        {/* Hook error panel */}
        {hookError && (
          <div className="border-t border-[var(--border-default)] px-3 py-2">
            <p className="mb-2 text-xs text-[var(--accent-red)]">{hookError}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setHookError(null);
                  handleDelete(true);
                }}
                className="rounded bg-[var(--accent-red)]/20 px-2 py-1 text-xs text-[var(--accent-red)] hover:bg-[var(--accent-red)]/30"
              >
                Delete anyway
              </button>
              <button
                onClick={() => setHookError(null)}
                className="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
