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
  Code2,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  EnrichedTask,
  PullRequestInfo,
  WorktreeInfo,
  TmuxSession,
  DiscoveredRepo,
  ClaudeSessionStatus,
  ClaudeModel,
} from "../../types";
import { CI_STATUSES } from "../../types";
import { CIStatusIcon } from "./CIStatusIcon";
import { useStartTask } from "../../hooks/useStartTask";
import {
  type SkillKey,
  resolveSkill,
  resolveModel,
  isOverriddenSkill,
  sendSkillToSession,
  BranchExistsError,
  BaseNotFoundError,
  BranchHasUnpushedError,
  HookFailedError,
  removeWorktreeFlow,
  openTerminalWithToast,
} from "../../lib/workflows";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  openEditor,
  tmuxKillSession,
  worktreeCreateExistingBranch,
} from "../../lib/tauri";
import { BranchSelector } from "../shared/BranchSelector";
import { QuickPeek } from "./QuickPeek";

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
  githubRepoBlocked: boolean;
  terminalActive: boolean | null;
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
    githubRepoBlocked,
    terminalActive,
    onDragStart,
    isBeingTargeted,
  } = data;
  const isDisabled = !task.isAssignedToMe;
  const terminal = useSettingsStore((s) => s.config.terminal);
  const editor = useSettingsStore((s) => s.config.editor);
  const globalSkills = useSettingsStore((s) => s.config.skills);
  const globalModels = useSettingsStore((s) => s.config.models);
  const queryClient = useQueryClient();
  const startTask = useStartTask();

  const [killingSession, setKillingSession] = useState(false);
  const [deletingWorktree, setDeletingWorktree] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<DiscoveredRepo | null>(null);
  const [pendingSkillKey, setPendingSkillKey] = useState<SkillKey>("CODE");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [branchError, setBranchError] = useState<{
    type: "exists" | "not-found" | "unpushed";
    branch: string;
    baseBranch?: string;
    repoPath: string;
  } | null>(null);
  const [hookError, setHookError] = useState<string | null>(null);
  const [sendingSkill, setSendingSkill] = useState(false);

  const hasSession = session !== null;
  const isLoading =
    startTask.isPending || killingSession || deletingWorktree || sendingSkill;
  const workflowStatus = getWorkflowStatus(session, pullRequest);
  const statusLabel = WORKFLOW_LABELS[workflowStatus];
  const claudeWaiting =
    claudeStatus === "waiting" && workflowStatus === "in-dev";

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

  async function handleDeleteWorktree(skipHooks = false) {
    if (!worktree || !worktreeRepoPath) return;
    setDeletingWorktree(true);
    setConfirmingDelete(false);
    setHookError(null);
    try {
      const repo = repos.find((r) => r.path === worktreeRepoPath);
      await removeWorktreeFlow({
        repoPath: worktreeRepoPath,
        worktreePath: worktree.path,
        branch: worktree.branch,
        deleteBranch: true,
        sessionName: session?.name,
        beforeRemove: repo?.beforeRemove,
        skipHooks,
        terminal,
      });
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
    } catch (err) {
      if (err instanceof HookFailedError) {
        setHookError(err.message);
      } else {
        toastError(err);
      }
    } finally {
      setDeletingWorktree(false);
    }
  }

  function getRepoSkillParams(
    repoPath: string,
    key: SkillKey,
  ): {
    skill: string;
    usePlugin: boolean;
    model: ClaudeModel | undefined;
  } {
    const repo = repos.find((r) => r.path === repoPath);
    return {
      skill: resolveSkill(key, repo?.skills, globalSkills),
      usePlugin: !isOverriddenSkill(key, repo?.skills, globalSkills),
      model: resolveModel(key, repo?.models, globalModels),
    };
  }

  function handleStart(repoPath: string, baseBranch?: string, key?: SkillKey) {
    setDropdownOpen(false);
    setSelectedRepo(null);
    setBranchError(null);
    const repo = repos.find((r) => r.path === repoPath);
    const { skill, usePlugin, model } = getRepoSkillParams(
      repoPath,
      key ?? pendingSkillKey,
    );
    const { terminalLayout } = useSettingsStore.getState().config;
    startTask.mutate(
      {
        issueId: task.id,
        identifier: task.identifier,
        repoPath,
        terminal,
        terminalLayout,
        copyPaths: repo?.copyPaths,
        onStart: repo?.onStart,
        baseBranch,
        fetchBefore: repo?.fetchBefore,
        skill,
        usePlugin,
        model,
      },
      {
        onError: (err) => {
          if (err instanceof BranchExistsError) {
            setBranchError({
              type: "exists",
              branch: err.branchName,
              baseBranch: err.baseBranch,
              repoPath: err.repoPath,
            });
          } else if (err instanceof BaseNotFoundError) {
            setBranchError({
              type: "not-found",
              branch: err.baseName,
              baseBranch: undefined,
              repoPath,
            });
          } else if (err instanceof BranchHasUnpushedError) {
            setBranchError({
              type: "unpushed",
              branch: err.branchName,
              baseBranch,
              repoPath,
            });
          } else {
            toastError(err);
          }
        },
      },
    );
  }

  async function handleExistingBranch(resetToBase: boolean, force = false) {
    if (!branchError) return;
    const { repoPath, baseBranch } = branchError;
    setBranchError(null);
    const repo = repos.find((r) => r.path === repoPath);
    const { skill, usePlugin, model } = getRepoSkillParams(
      repoPath,
      pendingSkillKey,
    );
    try {
      await worktreeCreateExistingBranch(
        repoPath,
        task.identifier,
        repo?.copyPaths,
        baseBranch,
        resetToBase,
        force,
      );
      const existingConfig = useSettingsStore.getState().config;
      startTask.mutate(
        {
          issueId: task.id,
          identifier: task.identifier,
          repoPath,
          terminal,
          terminalLayout: existingConfig.terminalLayout,
          copyPaths: repo?.copyPaths,
          onStart: repo?.onStart,
          baseBranch,
          fetchBefore: false,
          skill,
          usePlugin,
          model,
        },
        { onError: (err) => toastError(err) },
      );
    } catch (err) {
      if (
        !force &&
        err instanceof Error &&
        err.message.includes("BRANCH_HAS_UNPUSHED:")
      ) {
        setBranchError({
          type: "unpushed",
          branch: task.identifier,
          baseBranch,
          repoPath,
        });
      } else {
        toastError(err);
      }
    }
  }

  function openDropdown(key: SkillKey) {
    setPendingSkillKey(key);
    // If worktree already exists, skip branch selection and start directly
    if (worktree && worktreeRepoPath) {
      handleStart(worktreeRepoPath, undefined, key);
      return;
    }
    setDropdownOpen((prev) => !prev);
  }

  function handleOpenTerminal() {
    if (!session) return;
    if (!worktree) return;
    const { terminalLayout } = useSettingsStore.getState().config;
    openTerminalWithToast(
      terminal,
      session.name,
      task.identifier,
      worktree.path,
      terminalLayout,
    );
  }

  async function handleOpenEditor() {
    if (!worktree) return;
    try {
      await openEditor(editor, worktree.path);
    } catch (err) {
      toastError(err);
    }
  }

  async function handleFixCI() {
    if (!worktree || !worktreeRepoPath) return;
    const { skill } = getRepoSkillParams(worktreeRepoPath, "FIX_CI");

    if (session) {
      setSendingSkill(true);
      try {
        await sendSkillToSession(session.name, skill, task.identifier);
      } catch (err) {
        toastError(err);
        return;
      } finally {
        setSendingSkill(false);
      }
      handleOpenTerminal();
    } else {
      openDropdown("FIX_CI");
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

  const isTerminalActive = terminalActive !== null ? terminalActive : false;

  const card = (
    <div
      className={`nodrag nopan w-[380px] rounded-lg border bg-[var(--bg-tertiary)] shadow-lg relative ${
        isBeingTargeted
          ? "border-[var(--text-muted)] ring-1 ring-[var(--text-muted)]/50"
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
        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[var(--text-muted)] border border-[var(--bg-tertiary)] cursor-crosshair hover:scale-150 hover:bg-[var(--text-secondary)] transition-transform z-10"
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
          {claudeWaiting && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenTerminal();
              }}
              className="ml-auto flex cursor-pointer items-center gap-1 animate-pulse rounded px-1.5 py-0.5 text-[10px] font-medium bg-[var(--accent-orange)]/20 text-[var(--accent-orange)] hover:bg-[var(--accent-orange)]/30 transition-colors"
            >
              <AlertTriangle className="size-3" />
              Needs Claude Input
            </button>
          )}
          {hasSession && terminalActive !== null && (
            <span
              className={`${claudeWaiting ? "" : "ml-auto"} flex items-center`}
              title={terminalActive ? "Terminal open" : "Terminal closed"}
            >
              <Terminal
                className={`size-3.5 ${
                  terminalActive
                    ? "text-[var(--accent-green)]"
                    : "text-[var(--text-muted)]"
                }`}
              />
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
          <CIStatusIcon status={pullRequest.ciStatus} url={pullRequest.ciUrl} />
          {!isDisabled &&
            worktree &&
            (pullRequest.ciStatus === CI_STATUSES.FAILURE ||
              pullRequest.ciStatus === CI_STATUSES.ERROR) && (
              <button
                onClick={handleFixCI}
                disabled={isLoading}
                className="flex items-center gap-1 rounded bg-[var(--accent-red)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-red)] hover:bg-[var(--accent-red)]/30 disabled:opacity-50"
              >
                {sendingSkill ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  "Fix CI"
                )}
              </button>
            )}
        </div>
      )}

      {/* GitHub repo blocked warning */}
      {worktree && !pullRequest && githubRepoBlocked && (
        <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-3 py-2">
          <Github className="size-4 shrink-0 text-[var(--accent-red)]" />
          <span className="truncate text-xs text-[var(--accent-red)]">
            Access blocked by organization
          </span>
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
          {/* Code / Plan buttons with shared dropdown */}
          {!hasSession && (
            <>
              <button
                onClick={() => openDropdown("CODE")}
                disabled={isLoading || repos.length === 0}
                className="flex items-center gap-1 rounded bg-[var(--accent-green)] px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {startTask.isPending && pendingSkillKey === "CODE" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    <Play className="size-3.5" />
                    Code
                    <ChevronDown className="size-3" />
                  </>
                )}
              </button>
              <button
                onClick={() => openDropdown("PLAN")}
                disabled={isLoading || repos.length === 0}
                className="flex items-center gap-1 rounded bg-[var(--accent-blue)] px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {startTask.isPending && pendingSkillKey === "PLAN" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    <ClipboardList className="size-3.5" />
                    Plan
                    <ChevronDown className="size-3" />
                  </>
                )}
              </button>
            </>
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
                onClick={() => handleDeleteWorktree()}
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

          {/* Hook error panel */}
          {hookError && (
            <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-[var(--border-default)] bg-[var(--bg-tertiary)] p-3 shadow-lg">
              <p className="mb-2 text-xs text-[var(--accent-red)]">
                {hookError}
              </p>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    setHookError(null);
                    handleDeleteWorktree(true);
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

          {/* Branch error panel */}
          {branchError && (
            <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-[var(--border-default)] bg-[var(--bg-tertiary)] p-3 shadow-lg">
              {branchError.type === "exists" && (
                <>
                  <p className="mb-2 text-xs text-[var(--text-secondary)]">
                    Branch{" "}
                    <span className="font-medium">{branchError.branch}</span>{" "}
                    already exists.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => handleExistingBranch(false)}
                      className="rounded bg-[var(--accent-blue)]/20 px-2 py-1 text-xs text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/30"
                    >
                      Use existing branch
                    </button>
                    <button
                      onClick={() => handleExistingBranch(true)}
                      className="rounded bg-[var(--accent-amber)]/20 px-2 py-1 text-xs text-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/30"
                    >
                      Reset to base
                    </button>
                    <button
                      onClick={() => setBranchError(null)}
                      className="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
              {branchError.type === "not-found" && (
                <>
                  <p className="mb-2 text-xs text-[var(--accent-red)]">
                    Base branch{" "}
                    <span className="font-medium">{branchError.branch}</span>{" "}
                    not found.
                  </p>
                  <button
                    onClick={() => setBranchError(null)}
                    className="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                  >
                    Dismiss
                  </button>
                </>
              )}
              {branchError.type === "unpushed" && (
                <>
                  <p className="mb-2 text-xs text-[var(--accent-amber)]">
                    Branch{" "}
                    <span className="font-medium">{branchError.branch}</span>{" "}
                    has unpushed commits. Reset anyway?
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => handleExistingBranch(true, true)}
                      className="rounded bg-[var(--accent-red)]/20 px-2 py-1 text-xs text-[var(--accent-red)] hover:bg-[var(--accent-red)]/30"
                    >
                      Force reset
                    </button>
                    <button
                      onClick={() => handleExistingBranch(false)}
                      className="rounded bg-[var(--accent-blue)]/20 px-2 py-1 text-xs text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/30"
                    >
                      Use existing branch
                    </button>
                    <button
                      onClick={() => setBranchError(null)}
                      className="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (hasSession) {
    return (
      <QuickPeek sessionName={session.name} active={isTerminalActive}>
        {card}
      </QuickPeek>
    );
  }

  return card;
}
