import { useState, useEffect } from "react";
import { toastError } from "../../lib/toast";
import type { Node, NodeProps } from "@xyflow/react";
import {
  Terminal,
  Trash2,
  Loader2,
  GitBranch,
  Github,
  SquareKanban,
  ExternalLink,
  X,
  Code2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import type { WorktreeInfo, TmuxSession, PullRequestInfo } from "../../types";
import { WT_CI_STATUSES } from "../../types";
import { CiStatusBadge } from "./CiStatusBadge";
import { CmuxLink } from "../shared/CmuxLink";
import { useSettingsStore } from "../../stores/settingsStore";
import type { LinearIssueStub } from "../../hooks/useLinear";
import { useWorktreeRemove } from "../../hooks/useWorktrees";
import {
  tmuxKillSession,
  tmuxCreateSession,
  tmuxWaitForReady,
  tmuxSendKeys,
  openTerminal,
  openEditor,
  cmuxCloseWorkspace,
  wtMerge,
} from "../../lib/tauri";
import { useFetchRemote } from "../../hooks/useWorktrees";
import { DiffBadge } from "../shared/DiffBadge";
import {
  buildClaudeCommand,
  openTerminalWithToast,
  mapPrCiToWtCi,
  isMergeEligible,
  getMergeBlockReason,
} from "../../lib/workflows";
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
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const [mergingWorktree, setMergingWorktree] = useState(false);
  const [killingSession, setKillingSession] = useState(false);
  const [launchingSession, setLaunchingSession] = useState(false);
  const { fetching: fetchingRemote, fetchRemote: handleFetchRemote } =
    useFetchRemote(repoPath);

  const hasSession = session !== null;
  const isDeleting = removeWorktree.isPending;

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  async function handleLaunchSession() {
    setLaunchingSession(true);
    try {
      const cmd = await buildClaudeCommand();
      const { terminalLayout } = useSettingsStore.getState().config;

      if (terminal === "cmux") {
        // cmux manages its own sessions — openTerminal passes the Claude
        // command to CmuxController.create() which handles everything.
        await openTerminal(
          terminal,
          cmd,
          worktree.branch,
          worktree.path,
          terminalLayout,
        );
      } else {
        const sessionName = toSessionName(worktree.branch);
        await tmuxCreateSession(sessionName, worktree.path);
        await tmuxWaitForReady(sessionName);
        await tmuxSendKeys(sessionName, cmd);
        await openTerminal(
          terminal,
          sessionName,
          worktree.branch,
          worktree.path,
          terminalLayout,
        );
      }

      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
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
      if (terminal === "cmux") {
        await cmuxCloseWorkspace(toSessionName(worktree.branch));
      } else {
        await tmuxKillSession(toSessionName(worktree.branch));
      }
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
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

    try {
      await removeWorktree.mutateAsync({
        repoPath,
        branch: worktree.branch,
        sessionName: session ? toSessionName(worktree.branch) : undefined,
      });
    } catch (err) {
      toastError(err);
      return;
    }
    await queryClient.refetchQueries({ queryKey: ["worktrees"] });
    queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
  }

  async function handleMerge() {
    setConfirmingMerge(false);
    setMergingWorktree(true);
    try {
      if (session) {
        if (terminal === "cmux") {
          await cmuxCloseWorkspace(toSessionName(worktree.branch));
        } else {
          await tmuxKillSession(toSessionName(worktree.branch));
        }
      }
      await wtMerge(repoPath, worktree.branch);
      await queryClient.refetchQueries({ queryKey: ["worktrees"] });
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
    } catch (err) {
      toastError(err);
    } finally {
      setMergingWorktree(false);
    }
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
          <SquareKanban className="size-4 shrink-0 text-[var(--linear-brand)]" />
          <CmuxLink
            href={linearIssue.url}
            workspaceName={linearIssue.identifier ?? worktree.branch}
            terminal={terminal}
            className="flex items-center gap-1 min-w-0 text-sm text-[var(--linear-brand)] hover:text-[var(--linear-brand-hover)]"
          >
            <span className="truncate">{linearIssue.identifier}</span>
            <ExternalLink className="size-3 shrink-0" />
          </CmuxLink>
        </div>
      )}

      {/* PR Section */}
      {pullRequest && (
        <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-3 py-2">
          <Github className="size-4 shrink-0 text-[var(--accent-purple)]" />
          <CmuxLink
            href={pullRequest.url}
            workspaceName={linearIssue?.identifier ?? worktree.branch}
            terminal={terminal}
            className="flex items-center gap-1 min-w-0 flex-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <span className="truncate">PR #{pullRequest.number}</span>
            <ExternalLink className="size-3 shrink-0" />
          </CmuxLink>
          {pullRequest.ciStatus && (
            <CiStatusBadge
              status={mapPrCiToWtCi(pullRequest.ciStatus)}
              url={pullRequest.ciUrl}
              workspaceName={linearIssue?.identifier ?? worktree.branch}
              terminal={terminal}
            />
          )}
        </div>
      )}

      {/* Worktree Section */}
      <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-3 py-2">
        <GitBranch className="size-4 shrink-0 text-[var(--accent-green)]" />
        <span className="truncate text-sm text-[var(--text-secondary)]">
          {worktree.branch}
        </span>
        <DiffBadge added={worktree.diffAdded} deleted={worktree.diffDeleted} />
        {(worktree.ahead > 0 || worktree.behind > 0) && (
          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            {worktree.ahead > 0 && <span>↑{worktree.ahead}</span>}
            {worktree.behind > 0 && <span>↓{worktree.behind}</span>}
          </span>
        )}
        <button
          onClick={handleFetchRemote}
          disabled={fetchingRemote}
          className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
          title="Fetch remote"
        >
          <RefreshCw
            className={`size-3 ${fetchingRemote ? "animate-spin" : ""}`}
          />
        </button>
        {worktree.ciStatus && worktree.ciStatus !== WT_CI_STATUSES.NO_CI && (
          <span className="ml-auto">
            <CiStatusBadge
              status={worktree.ciStatus}
              url={worktree.ciUrl}
              stale={worktree.ciStale}
              workspaceName={linearIssue?.identifier ?? worktree.branch}
              terminal={terminal}
            />
          </span>
        )}
        {getMergeBlockReason(worktree, pullRequest) && (
          <span
            className={
              worktree.ciStatus && worktree.ciStatus !== WT_CI_STATUSES.NO_CI
                ? ""
                : "ml-auto"
            }
            title={getMergeBlockReason(worktree, pullRequest)!}
          >
            <AlertTriangle className="size-3.5 text-[var(--accent-amber)]" />
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Terminal / Launch button */}
        {hasSession ? (
          <button
            onClick={handleOpenTerminal}
            className="flex items-center gap-1 rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors"
          >
            <Terminal className="size-3.5" />
            Terminal
          </button>
        ) : (
          <button
            onClick={handleLaunchSession}
            disabled={launchingSession}
            className="flex items-center gap-1 rounded bg-[var(--accent-green)] px-2 py-1 text-xs font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
          >
            {launchingSession ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Terminal className="size-3.5" />
            )}
            Launch Claude
          </button>
        )}

        {/* Editor button */}
        <button
          onClick={handleOpenEditor}
          className="flex items-center gap-1 rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors"
        >
          <Code2 className="size-3.5" />
          Editor
        </button>

        {/* Merge button — visible when: worktree not dirty, no conflicts, and CI ok (PR or wt CI green) */}
        {isMergeEligible(worktree, pullRequest) &&
          !confirmingDelete &&
          !confirmingMerge && (
            <button
              onClick={() => setConfirmingMerge(true)}
              disabled={mergingWorktree}
              className="flex items-center gap-1 rounded bg-[var(--accent-green)]/20 px-2 py-1 text-xs font-medium text-[var(--accent-green)] hover:bg-[var(--accent-green)]/30 disabled:opacity-50"
              title="Merge locally via wt merge"
            >
              {mergingWorktree ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                "Merge"
              )}
            </button>
          )}

        {/* Merge confirmation */}
        {confirmingMerge && (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-[var(--text-muted)]">Confirm merge?</span>
            <button
              onClick={handleMerge}
              disabled={mergingWorktree}
              className="text-[var(--accent-green)] transition-all hover:brightness-125 disabled:opacity-50"
            >
              {mergingWorktree ? "Merging..." : "Yes"}
            </button>
            <span className="text-[var(--text-muted)]">/</span>
            <button
              onClick={() => setConfirmingMerge(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              No
            </button>
          </span>
        )}

        {/* Kill session button */}
        {hasSession && !confirmingDelete && (
          <button
            onClick={handleKillSession}
            disabled={killingSession}
            className="flex items-center gap-1 rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--accent-red)] hover:bg-[var(--accent-red)]/20 disabled:opacity-50"
            title={
              terminal === "cmux"
                ? "Close cmux workspace (keeps worktree)"
                : "Kill tmux session (keeps worktree)"
            }
          >
            {killingSession ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
          </button>
        )}

        {/* Delete worktree button */}
        {!confirmingDelete && (
          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={isDeleting}
            className="flex items-center gap-1 rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--accent-red)] hover:bg-[var(--accent-red)]/20 disabled:opacity-50"
            title="Delete worktree and branch"
          >
            {isDeleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </button>
        )}

        {/* Delete confirmation */}
        {confirmingDelete && (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-[var(--text-muted)]">Delete worktree?</span>
            <button
              onClick={() => handleDelete()}
              disabled={isDeleting}
              className="text-[var(--accent-red)] transition-all hover:brightness-125 disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Yes"}
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
      </div>
    </div>
  );
}
