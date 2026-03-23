import { useState, useEffect, useRef } from "react";
import { toastError } from "../../lib/toast";
import type { Node, NodeProps } from "@xyflow/react";
import {
  Terminal,
  Trash2,
  Loader2,
  GitBranch,
  ExternalLink,
  X,
  Code2,
  RefreshCw,
  AlertTriangle,
  MoreHorizontal,
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
import { GithubIcon } from "../shared/GithubIcon";
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
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const { fetching: fetchingRemote, fetchRemote: handleFetchRemote } =
    useFetchRemote(repoPath);

  const hasSession = session !== null;
  const isDeleting = removeWorktree.isPending;
  const isLoading =
    killingSession || isDeleting || mergingWorktree || launchingSession;
  const workspaceName = linearIssue?.identifier ?? worktree.branch;

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  useEffect(() => {
    if (!overflowOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        overflowRef.current &&
        !overflowRef.current.contains(e.target as globalThis.Node)
      ) {
        setOverflowOpen(false);
        setConfirmingDelete(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [overflowOpen]);

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
    } catch (err) {
      toastError(err);
    } finally {
      setKillingSession(false);
    }
  }

  async function handleDeleteWorktree() {
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
      {/* ── HEADER ZONE ── */}
      <div className="border-b border-[var(--border-default)] px-3 py-2">
        <div className="flex items-center gap-2">
          {linearIssue ? (
            <CmuxLink
              href={linearIssue.url}
              workspaceName={workspaceName}
              terminal={terminal}
              className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              {linearIssue.identifier}
            </CmuxLink>
          ) : (
            <GitBranch className="size-3.5 shrink-0 text-[var(--accent-green)]" />
          )}
          <span className="ml-auto shrink-0 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
            {repoId}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-[var(--text-primary)]">
          {linearIssue ? linearIssue.title : worktree.branch}
        </p>
      </div>

      {/* ── DETAILS ZONE ── */}
      <div className="border-b border-[var(--border-default)] px-3 py-2 space-y-1">
        {/* Worktree line */}
        <div className="flex items-center gap-2">
          <GitBranch className="size-3.5 shrink-0 text-[var(--accent-green)]" />
          <span className="truncate text-xs text-[var(--text-secondary)]">
            {worktree.branch}
          </span>
          <DiffBadge
            added={worktree.diffAdded}
            deleted={worktree.diffDeleted}
          />
          {(worktree.ahead > 0 || worktree.behind > 0) && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
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
          {/* Show worktree CI only when no PR CI exists (PR CI supersedes) */}
          {worktree.ciStatus &&
            worktree.ciStatus !== WT_CI_STATUSES.NO_CI &&
            !pullRequest?.ciStatus && (
              <span className="ml-auto">
                <CiStatusBadge
                  status={worktree.ciStatus}
                  url={worktree.ciUrl}
                  stale={worktree.ciStale}
                  workspaceName={workspaceName}
                  terminal={terminal}
                />
              </span>
            )}
          {getMergeBlockReason(worktree, pullRequest) && (
            <span
              className={
                worktree.ciStatus &&
                worktree.ciStatus !== WT_CI_STATUSES.NO_CI &&
                !pullRequest?.ciStatus
                  ? ""
                  : "ml-auto"
              }
              title={getMergeBlockReason(worktree, pullRequest)!}
            >
              <AlertTriangle className="size-3.5 text-[var(--accent-amber)]" />
            </span>
          )}
        </div>

        {/* PR line */}
        {pullRequest && (
          <div className="flex items-center gap-2">
            <GithubIcon className="size-3.5 shrink-0 text-[var(--accent-purple)]" />
            <CmuxLink
              href={pullRequest.url}
              workspaceName={workspaceName}
              terminal={terminal}
              className="flex items-center gap-1 min-w-0 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <span className="truncate">PR #{pullRequest.number}</span>
              <ExternalLink className="size-3 shrink-0" />
            </CmuxLink>
            {pullRequest.ciStatus && (
              <CiStatusBadge
                status={mapPrCiToWtCi(pullRequest.ciStatus)}
                url={pullRequest.ciUrl}
                workspaceName={workspaceName}
                terminal={terminal}
              />
            )}
          </div>
        )}
      </div>

      {/* ── ACTIONS ZONE ── */}
      <div className="flex items-center gap-1.5 px-3 py-2">
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

        {/* Editor button — icon only */}
        <button
          onClick={handleOpenEditor}
          className="flex items-center rounded bg-[var(--bg-elevated)] px-1.5 py-1 text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors"
          title={`Open in ${editor}`}
        >
          <Code2 className="size-3.5" />
        </button>

        {/* Merge button */}
        {isMergeEligible(worktree, pullRequest) && !confirmingMerge && (
          <button
            onClick={() => setConfirmingMerge(true)}
            disabled={isLoading}
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
            <span className="text-[var(--text-muted)]">Merge?</span>
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

        {/* Overflow menu for destructive actions */}
        {!confirmingMerge && (
          <div className="ml-auto relative" ref={overflowRef}>
            <button
              onClick={() => setOverflowOpen(!overflowOpen)}
              className="flex items-center rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
            {overflowOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-tertiary)] py-1 shadow-lg min-w-36">
                {hasSession && (
                  <button
                    onClick={() => {
                      setOverflowOpen(false);
                      handleKillSession();
                    }}
                    disabled={isLoading}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                  >
                    {killingSession ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <X className="size-3" />
                    )}
                    Kill session
                  </button>
                )}
                {confirmingDelete ? (
                  <button
                    onClick={() => {
                      setOverflowOpen(false);
                      handleDeleteWorktree();
                    }}
                    disabled={isDeleting}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                    Confirm delete?
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    disabled={isLoading}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                  >
                    <Trash2 className="size-3" />
                    Delete worktree
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
