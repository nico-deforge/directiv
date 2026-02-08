import { useState, useEffect, useRef, useCallback } from "react";
import { toastError } from "../../lib/toast";
import type { Node, NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import {
  Play,
  X,
  Trash2,
  Terminal,
  Loader2,
  ChevronDown,
  GitBranch,
  Github,
  Circle,
  SquareKanban,
  ExternalLink,
  ChevronLeft,
  Code2,
  AlertTriangle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  EnrichedTask,
  PullRequestInfo,
  WorktreeInfo,
  TmuxSession,
  DiscoveredRepo,
  ClaudeSessionStatus,
} from "../../types";
import { useStartTask } from "../../hooks/useStartTask";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  openTerminal,
  openEditor,
  tmuxKillSession,
  worktreeRemove,
} from "../../lib/tauri";
import { useWorktrees } from "../../hooks/useWorktrees";

type WorkflowStatus =
  | "todo"
  | "in-dev"
  | "personal-review"
  | "in-review"
  | "to-deploy";

const WORKFLOW_LABELS: Record<
  WorkflowStatus,
  { label: string; className: string }
> = {
  todo: {
    label: "To Do",
    className: "bg-neutral-500/20 text-[var(--text-muted)]",
  },
  "in-dev": {
    label: "In Dev",
    className: "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]",
  },
  "personal-review": {
    label: "Personal Review",
    className: "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]",
  },
  "in-review": {
    label: "In Review",
    className: "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]",
  },
  "to-deploy": {
    label: "To Deploy",
    className: "bg-[var(--accent-green)]/20 text-[var(--accent-green)]",
  },
};

function getWorkflowStatus(
  session: TmuxSession | null,
  pr: PullRequestInfo | null,
): WorkflowStatus {
  if (!pr) {
    return session ? "in-dev" : "todo";
  }

  // Use GitHub's reviewDecision as source of truth
  if (pr.reviewDecision === "APPROVED") {
    return "to-deploy";
  }

  if (pr.reviewDecision === "CHANGES_REQUESTED") {
    return "in-dev"; // Back to dev to address changes
  }

  // Check if PR has reviewers requested or has reviews
  const hasReviewers = pr.requestedReviewerCount > 0 || pr.reviews.length > 0;

  if (hasReviewers) {
    return "in-review";
  }

  return "personal-review";
}

export type UnifiedTaskNodeData = {
  task: EnrichedTask;
  worktree: WorktreeInfo | null;
  worktreeRepoPath: string | null;
  session: TmuxSession | null;
  pullRequest: PullRequestInfo | null;
  repos: DiscoveredRepo[];
  claudeStatus: ClaudeSessionStatus | null;
  onDragStart?: (nodeId: string, e: React.MouseEvent) => void;
  isBeingTargeted?: boolean;
};

export type UnifiedTaskNodeType = Node<UnifiedTaskNodeData, "unifiedTask">;

export function UnifiedTaskCard({ id, data }: NodeProps<UnifiedTaskNodeType>) {
  const {
    task,
    worktree,
    worktreeRepoPath,
    session,
    pullRequest,
    repos,
    claudeStatus,
    onDragStart,
    isBeingTargeted,
  } = data;
  const isDisabled = !task.isAssignedToMe;
  const terminal = useSettingsStore((s) => s.config.terminal);
  const editor = useSettingsStore((s) => s.config.editor);
  const queryClient = useQueryClient();
  const startTask = useStartTask();

  const [killingSession, setKillingSession] = useState(false);
  const [deletingWorktree, setDeletingWorktree] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<DiscoveredRepo | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasSession = session !== null;
  const isLoading = startTask.isPending || killingSession || deletingWorktree;
  const workflowStatus = getWorkflowStatus(session, pullRequest);
  const statusLabel = WORKFLOW_LABELS[workflowStatus];
  const needsInput =
    claudeStatus === "waiting" || workflowStatus === "personal-review";

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as globalThis.Node)
      ) {
        setDropdownOpen(false);
        setSelectedRepo(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  async function handleKillSession() {
    if (!session) return;
    setKillingSession(true);
    try {
      await tmuxKillSession(session.name);
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
    } catch (err) {
      toastError(err);
    } finally {
      setKillingSession(false);
    }
  }

  async function handleDeleteWorktree() {
    if (!worktree || !worktreeRepoPath) return;
    setDeletingWorktree(true);
    setConfirmingDelete(false);
    try {
      // Kill session if it exists
      if (session) {
        try {
          await tmuxKillSession(session.name);
        } catch {
          // Session may already be dead
        }
      }
      // Remove worktree and delete branch
      await worktreeRemove(
        worktreeRepoPath,
        worktree.path,
        worktree.branch,
        true,
      );
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
    } catch (err) {
      toastError(err);
    } finally {
      setDeletingWorktree(false);
    }
  }

  function handleStart(repoPath: string, baseBranch?: string) {
    setDropdownOpen(false);
    setSelectedRepo(null);
    const repo = repos.find((r) => r.path === repoPath);
    startTask.mutate(
      {
        issueId: task.id,
        identifier: task.identifier,
        repoPath,
        terminal,
        copyPaths: repo?.copyPaths,
        onStart: repo?.onStart,
        baseBranch,
        fetchBefore: repo?.fetchBefore,
      },
      {
        onError: (err) => toastError(err),
      },
    );
  }

  async function handleOpenTerminal() {
    if (!session) return;
    try {
      await openTerminal(terminal, session.name);
    } catch (err) {
      toastError(err);
    }
  }

  async function handleOpenEditor() {
    if (!worktree) return;
    try {
      await openEditor(editor, worktree.path);
    } catch (err) {
      toastError(err);
    }
  }

  const handleDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDragStart?.(id, e);
    },
    [id, onDragStart],
  );

  return (
    <div
      className={`nodrag nopan w-[380px] rounded-lg border bg-[var(--bg-tertiary)] shadow-lg relative ${
        isBeingTargeted
          ? "border-[var(--accent-amber)] ring-2 ring-[var(--accent-amber)]"
          : "border-[var(--border-default)]"
      } ${isDisabled ? "opacity-50" : ""}`}
    >
      {/* Hidden target handle for edge connections */}
      <Handle
        type="target"
        position={Position.Top}
        className="!opacity-0 !pointer-events-none"
      />
      {/* Drag handle at bottom center - starts blocked-by edge creation */}
      <div
        className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-[var(--accent-amber)] border-2 border-[var(--bg-tertiary)] cursor-crosshair hover:scale-125 transition-transform z-10"
        onMouseDown={handleDragHandleMouseDown}
      />
      {/* Hidden source handle for edge connections */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!opacity-0 !pointer-events-none"
      />

      {/* Header: Task info with workflow status */}
      <div className="border-b border-[var(--border-default)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusLabel.className}`}
          >
            {statusLabel.label}
          </span>
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {task.identifier}
          </span>
          {isDisabled && task.assigneeName && (
            <span className="text-[10px] text-[var(--text-muted)]">
              {task.assigneeName}
            </span>
          )}
          {needsInput && (
            <span className="ml-auto flex items-center gap-1 animate-pulse rounded px-1.5 py-0.5 text-[10px] font-medium bg-[var(--accent-red)]/20 text-[var(--accent-red)]">
              <AlertTriangle className="size-3" />
              Needs Input
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-[var(--text-primary)]">
          {task.title}
        </p>
      </div>

      {/* Linear Section */}
      <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-3 py-2">
        <SquareKanban className="size-4 shrink-0 text-[var(--accent-blue)]" />
        <a
          href={task.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 min-w-0 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <span className="truncate">{task.identifier}</span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">
          {task.status}
        </span>
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

      {/* Worktree Section */}
      {worktree && (
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
      )}

      {/* Actions */}
      {!isDisabled && (
        <div
          className="relative flex items-center gap-2 px-3 py-2"
          ref={dropdownRef}
        >
          {/* Start button with dropdown */}
          {!hasSession && (
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              disabled={isLoading || repos.length === 0}
              className="flex items-center gap-1 rounded bg-[var(--accent-green)] px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {startTask.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <>
                  <Play className="size-3.5" />
                  Start
                  <ChevronDown className="size-3" />
                </>
              )}
            </button>
          )}

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
          {worktree && (
            <button
              onClick={handleOpenEditor}
              className="flex items-center gap-1 rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:opacity-80"
            >
              <Code2 className="size-3.5" />
              Editor
            </button>
          )}

          {/* Kill Session button */}
          {hasSession && !confirmingDelete && (
            <button
              onClick={handleKillSession}
              disabled={isLoading}
              className="flex items-center gap-1 rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--accent-red)] hover:bg-[var(--accent-red)]/20 disabled:opacity-50"
              title="Kill tmux session (keeps worktree)"
            >
              {killingSession ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
            </button>
          )}

          {/* Delete Worktree button */}
          {worktree && !confirmingDelete && (
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={isLoading}
              className="flex items-center gap-1 rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--accent-red)] hover:bg-[var(--accent-red)]/20 disabled:opacity-50"
              title="Delete worktree and branch"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}

          {/* Delete confirmation */}
          {confirmingDelete && (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-[var(--text-muted)]">Delete worktree?</span>
              <button
                onClick={handleDeleteWorktree}
                disabled={deletingWorktree}
                className="text-[var(--accent-red)] hover:opacity-80 disabled:opacity-50"
              >
                {deletingWorktree ? "Deleting..." : "Yes"}
              </button>
              <span className="text-[var(--text-muted)]">/</span>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                No
              </button>
            </span>
          )}

          {/* Dropdown for repo/branch selection */}
          {dropdownOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-tertiary)] py-1 shadow-lg">
              {repos.length === 1 ? (
                <BranchSelector
                  repoPath={repos[0].path}
                  configWarning={repos[0].configWarning}
                  onSelect={(baseBranch) =>
                    handleStart(repos[0].path, baseBranch)
                  }
                />
              ) : selectedRepo ? (
                <BranchSelector
                  repoPath={selectedRepo.path}
                  repoId={selectedRepo.id}
                  configWarning={selectedRepo.configWarning}
                  onSelect={(baseBranch) =>
                    handleStart(selectedRepo.path, baseBranch)
                  }
                  onBack={() => setSelectedRepo(null)}
                />
              ) : (
                <div className="min-w-40">
                  {repos.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => setSelectedRepo(repo)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    >
                      {repo.id}
                      {repo.configWarning && (
                        <span title={repo.configWarning}>
                          <AlertTriangle className="size-3.5 shrink-0 text-[var(--accent-amber)]" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Inline BranchSelector for the card
function BranchSelector({
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
          onClick={onBack}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeft className="size-3" />
          {repoId ?? "Back"}
        </button>
      )}
      <button
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
