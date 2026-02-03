import { useState, useEffect, useRef } from "react";
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
  GitPullRequest,
  Circle,
  ExternalLink,
  ChevronLeft,
  Code2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  EnrichedTask,
  PullRequestInfo,
  WorktreeInfo,
  TmuxSession,
  RepoConfig,
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

const PRIORITY_COLORS: Record<number, string> = {
  0: "bg-neutral-400",
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-yellow-500",
  4: "bg-blue-500",
};

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

  // Has PR - check review status
  const hasApproval = pr.reviews.some((r) => r.state === "APPROVED");
  const hasChangesRequested = pr.reviews.some(
    (r) => r.state === "CHANGES_REQUESTED",
  );

  if (hasApproval && !hasChangesRequested) {
    return "to-deploy";
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
  repos: RepoConfig[];
};

export type UnifiedTaskNodeType = Node<UnifiedTaskNodeData, "unifiedTask">;

export function UnifiedTaskCard({ data }: NodeProps<UnifiedTaskNodeType>) {
  const { task, worktree, worktreeRepoPath, session, pullRequest, repos } =
    data;
  const terminal = useSettingsStore((s) => s.config.terminal);
  const editor = useSettingsStore((s) => s.config.editor);
  const queryClient = useQueryClient();
  const startTask = useStartTask();

  const [error, setError] = useState<string | null>(null);
  const [killingSession, setKillingSession] = useState(false);
  const [deletingWorktree, setDeletingWorktree] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<RepoConfig | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const priorityColor = PRIORITY_COLORS[task.priority] ?? "bg-neutral-400";
  const hasSession = session !== null;
  const isLoading = startTask.isPending || killingSession || deletingWorktree;
  const workflowStatus = getWorkflowStatus(session, pullRequest);
  const statusLabel = WORKFLOW_LABELS[workflowStatus];

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

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
    setError(null);
    try {
      await tmuxKillSession(session.name);
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setKillingSession(false);
    }
  }

  async function handleDeleteWorktree() {
    if (!worktree || !worktreeRepoPath) return;
    setDeletingWorktree(true);
    setConfirmingDelete(false);
    setError(null);
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingWorktree(false);
    }
  }

  function handleStart(repoPath: string, baseBranch?: string) {
    setError(null);
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
        baseBranch: baseBranch ?? repo?.baseBranch,
        fetchBefore: repo?.fetchBefore,
      },
      {
        onError: (err) =>
          setError(err instanceof Error ? err.message : String(err)),
      },
    );
  }

  async function handleOpenTerminal() {
    if (!session) return;
    try {
      await openTerminal(terminal, session.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleOpenEditor() {
    if (!worktree) return;
    try {
      await openEditor(editor, worktree.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="nodrag nopan w-[380px] rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] shadow-lg relative">
      {/* ReactFlow handles for edges */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-[var(--accent-amber)]/60 !w-2 !h-2 !border-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-[var(--accent-amber)]/60 !w-2 !h-2 !border-0"
      />

      {/* Header: Task info with workflow status */}
      <div className="border-b border-[var(--border-default)] px-3 py-2">
        <div className="flex items-start gap-2">
          <span
            className={`mt-1.5 size-2 shrink-0 rounded-full ${priorityColor}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusLabel.className}`}
              >
                {statusLabel.label}
              </span>
              <a
                href={task.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-[var(--accent-blue)] hover:opacity-80"
              >
                {task.identifier}
                <ExternalLink className="size-3" />
              </a>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-[var(--text-primary)]">
              {task.title}
            </p>
          </div>
        </div>
      </div>

      {/* PR Section */}
      {pullRequest && (
        <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-3 py-2">
          <GitPullRequest className="size-4 shrink-0 text-[var(--accent-purple)]" />
          <a
            href={pullRequest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            PR #{pullRequest.number}
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
                onSelect={(baseBranch) =>
                  handleStart(repos[0].path, baseBranch)
                }
              />
            ) : selectedRepo ? (
              <BranchSelector
                repoPath={selectedRepo.path}
                repoId={selectedRepo.id}
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
                    className="block w-full px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                  >
                    {repo.id}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="px-3 pb-2 text-xs text-[var(--accent-red)]">{error}</p>
      )}
    </div>
  );
}

// Inline BranchSelector for the card
function BranchSelector({
  repoPath,
  repoId,
  onSelect,
  onBack,
}: {
  repoPath: string;
  repoId?: string;
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
