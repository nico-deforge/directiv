import { useState, useCallback } from "react";
import { toastError } from "../../lib/toast";
import { Link } from "@tanstack/react-router";
import {
  Folder,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  RefreshCw,
  Trash2,
  Loader2,
  X,
  ExternalLink,
  Terminal,
  Kanban,
  Plus,
  Settings,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useProjectStore,
  ORPHAN_PROJECT_ID,
  OTHER_ISSUES_PROJECT_ID,
  type Project,
} from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWorkspaceRepos } from "../../hooks/useWorkspace";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import {
  wtList,
  tmuxKillSession,
  tmuxListSessions,
  cmuxCloseWorkspace,
  queryTerminals,
} from "../../lib/tauri";
import { removeWorktreeFlow, BranchExistsError } from "../../lib/workflows";
import type {
  StaleWorktree,
  ReviewRequestedPR,
  TmuxSession,
} from "../../types";
import {
  useGitHubReviewRequests,
  useIsGitHubConnected,
} from "../../hooks/useGitHub";
import { useStartFreeTask } from "../../hooks/useStartTask";
import { wtSwitchCreateNoHooks } from "../../lib/tauri";
import { toSessionName } from "../../lib/tmux-utils";
import { WorkspaceSelector } from "./WorkspaceSelector";
import { BranchSelector } from "../shared/BranchSelector";

export function ProjectSelector() {
  const projects = useProjectStore((s) => s.projects);
  const orphanCount = useProjectStore((s) => s.orphanCount);
  const otherIssuesCount = useProjectStore((s) => s.otherIssuesCount);
  const connectionStatus = useProjectStore((s) => s.connectionStatus);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const selectProject = useProjectStore((s) => s.selectProject);
  const showBacklogProjects = useProjectStore((s) => s.showBacklogProjects);
  const toggleBacklogProjects = useProjectStore((s) => s.toggleBacklogProjects);
  const queryClient = useQueryClient();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const startedProjects = projects.filter((p) => p.statusType === "started");
  const backlogProjects = projects.filter((p) => p.statusType === "backlog");

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["linear"] }),
      queryClient.invalidateQueries({ queryKey: ["github"] }),
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["worktrees"] }),
    ]);
    setIsRefreshing(false);
  }

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-secondary)]">
      <WorkspaceSelector />
      <div className="shrink-0 border-b border-[var(--border-default)] px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Projects
          </h2>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:opacity-50"
            title="Refresh all data"
          >
            <RefreshCw
              className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {connectionStatus.status === "no-teams" && (
          <div className="px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--accent-amber)]" />
              <div>
                <p className="text-sm font-medium text-[var(--accent-amber)]">
                  No teams configured
                </p>
                <Link
                  to="/config"
                  className="mt-1 block text-xs text-[var(--accent-blue)] hover:underline"
                >
                  Configure teams in Settings →
                </Link>
              </div>
            </div>
          </div>
        )}

        {connectionStatus.status === "loading" && (
          <div className="flex items-center gap-2 px-4 py-3">
            <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">
              Loading projects...
            </p>
          </div>
        )}

        {connectionStatus.status === "error" && (
          <div className="px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--accent-red)]" />
              <div>
                <p className="text-sm font-medium text-[var(--accent-red)]">
                  Linear API error
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {connectionStatus.message}
                </p>
              </div>
            </div>
          </div>
        )}

        {connectionStatus.status === "connected" &&
          startedProjects.length === 0 &&
          backlogProjects.length === 0 &&
          otherIssuesCount === 0 &&
          orphanCount === 0 && (
            <p className="px-4 py-2 text-sm text-[var(--text-muted)]">
              No active projects found
            </p>
          )}

        {startedProjects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            isSelected={selectedProjectId === project.id}
            onSelect={() => selectProject(project.id)}
          />
        ))}

        {backlogProjects.length > 0 && (
          <>
            <button
              onClick={toggleBacklogProjects}
              className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <ChevronRight
                className={`size-3 shrink-0 transition-transform ${showBacklogProjects ? "rotate-90" : ""}`}
              />
              <span>Backlog</span>
              <span className="ml-auto text-[10px] tabular-nums opacity-60">
                {backlogProjects.length}
              </span>
            </button>
            {showBacklogProjects &&
              backlogProjects.map((project) => (
                <ProjectItem
                  key={project.id}
                  project={project}
                  isSelected={selectedProjectId === project.id}
                  onSelect={() => selectProject(project.id)}
                />
              ))}
          </>
        )}
        {projects.length > 0 && (
          <div className="mx-3 my-2 border-t border-[var(--border-default)]" />
        )}
        <button
          onClick={() => selectProject(OTHER_ISSUES_PROJECT_ID)}
          disabled={otherIssuesCount === 0}
          className={`flex w-full items-center gap-2 px-4 py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-40 ${
            selectedProjectId === OTHER_ISSUES_PROJECT_ID
              ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Kanban className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm">Other issues</span>
          <span className="shrink-0 text-[10px] tabular-nums opacity-60">
            {otherIssuesCount}
          </span>
        </button>
        <button
          onClick={() => selectProject(ORPHAN_PROJECT_ID)}
          disabled={orphanCount === 0}
          className={`flex w-full items-center gap-2 px-4 py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-40 ${
            selectedProjectId === ORPHAN_PROJECT_ID
              ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <GitBranch className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm">
            Other worktrees
          </span>
          <span className="shrink-0 text-[10px] tabular-nums opacity-60">
            {orphanCount}
          </span>
        </button>
        <ReviewRequestsSection />
      </div>
      <NewWorktreeSection />
      <CleanupSection />
      <OrphanSessionsSection />
      <div className="shrink-0 border-t border-[var(--border-default)]">
        <Link
          to="/config"
          className="flex w-full items-center justify-center gap-1.5 px-4 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <Settings className="size-3" />
          Settings
        </Link>
      </div>
    </aside>
  );
}

function NewWorktreeSection() {
  const repos = useWorkspaceRepos();
  const terminal = useSettingsStore((s) => s.config.terminal);
  const terminalLayout = useSettingsStore((s) => s.config.terminalLayout);
  const startFreeTask = useStartFreeTask();

  const [showForm, setShowForm] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [selectedRepoIndex, setSelectedRepoIndex] = useState(0);
  const [baseBranch, setBaseBranch] = useState<string | undefined>(undefined);
  const [showBranchSelector, setShowBranchSelector] = useState(false);
  const [branchExistsPrompt, setBranchExistsPrompt] = useState<{
    branch: string;
    repoPath: string;
  } | null>(null);

  const isValidBranchName = (name: string) =>
    /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(name);

  const canCreate =
    branchName.trim().length > 0 &&
    isValidBranchName(branchName.trim()) &&
    !startFreeTask.isPending;

  async function handleCreate() {
    const repo = repos[selectedRepoIndex];
    setBranchExistsPrompt(null);
    startFreeTask.mutate(
      {
        branchName: branchName.trim(),
        repoPath: repo.path,
        terminal,
        terminalLayout,
      },
      {
        onSuccess: () => {
          setShowForm(false);
          setBranchName("");
          setBaseBranch(undefined);
        },
        onError: (err) => {
          if (err instanceof BranchExistsError) {
            setBranchExistsPrompt({
              branch: err.branchName,
              repoPath: err.repoPath,
            });
          } else {
            toastError(err);
          }
        },
      },
    );
  }

  async function handleUseExisting() {
    if (!branchExistsPrompt) return;
    const { repoPath } = branchExistsPrompt;
    setBranchExistsPrompt(null);
    try {
      await wtSwitchCreateNoHooks(repoPath, branchName.trim());
      startFreeTask.mutate(
        {
          branchName: branchName.trim(),
          repoPath,
          terminal,
          terminalLayout,
        },
        {
          onSuccess: () => {
            setShowForm(false);
            setBranchName("");
            setBaseBranch(undefined);
          },
          onError: (err) => toastError(err),
        },
      );
    } catch (err) {
      toastError(err);
    }
  }

  const allRepos = useWorkspaceStore((s) => s.repos);
  const isScanning = useWorkspaceStore((s) => s.isScanning);
  const wsError = useWorkspaceStore((s) => s.error);

  if (repos.length === 0) {
    return (
      <div className="shrink-0 border-t border-[var(--border-default)] px-4 py-2">
        <p
          className={`text-xs font-medium ${isScanning ? "text-[var(--text-muted)]" : "text-[var(--accent-red)]"}`}
        >
          {isScanning
            ? "Scanning workspaces…"
            : wsError
              ? `Scan error: ${wsError}`
              : `No repos (total: ${allRepos.length})`}
        </p>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-[var(--border-default)]">
      {showForm ? (
        <div className="p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              New worktree
            </span>
            <button
              onClick={() => setShowForm(false)}
              className="rounded p-0.5 hover:bg-[var(--bg-elevated)]"
            >
              <X className="size-3 text-[var(--text-muted)]" />
            </button>
          </div>
          {repos.length > 1 && (
            <select
              value={selectedRepoIndex}
              onChange={(e) => setSelectedRepoIndex(Number(e.target.value))}
              className="mb-2 w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]"
            >
              {repos.map((repo, idx) => (
                <option key={repo.id} value={idx}>
                  {repo.id}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="branch-name"
            className="mb-2 w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) {
                handleCreate();
              }
            }}
            autoFocus
          />
          {/* Base branch selector */}
          <div className="relative mb-2">
            <button
              onClick={() => setShowBranchSelector((prev) => !prev)}
              className="flex w-full items-center gap-1.5 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-secondary)]"
            >
              <GitBranch className="size-3 text-[var(--text-muted)]" />
              Base: {baseBranch ?? "main"}
              <span className="ml-auto text-[10px] text-[var(--text-muted)]">
                Change
              </span>
            </button>
            {showBranchSelector && (
              <div className="absolute left-0 top-full z-20 mt-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-tertiary)] py-1 shadow-lg">
                <BranchSelector
                  repoPath={repos[selectedRepoIndex].path}
                  onSelect={(branch) => {
                    setBaseBranch(branch);
                    setShowBranchSelector(false);
                  }}
                />
              </div>
            )}
          </div>
          {branchExistsPrompt ? (
            <div className="rounded border border-[var(--border-default)] bg-[var(--bg-primary)] p-2">
              <p className="mb-1.5 text-[10px] text-[var(--text-secondary)]">
                Branch{" "}
                <span className="font-medium">{branchExistsPrompt.branch}</span>{" "}
                already exists.
              </p>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleUseExisting()}
                  className="rounded bg-[var(--accent-blue)]/20 px-2 py-1 text-[10px] text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/30"
                >
                  Use existing
                </button>
                <button
                  onClick={() => setBranchExistsPrompt(null)}
                  className="rounded px-2 py-1 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              className="w-full rounded bg-[var(--accent-blue)]/20 px-2 py-1 text-xs text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/30 disabled:opacity-50"
            >
              {startFreeTask.isPending ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" />
                  Creating...
                </span>
              ) : (
                "Create & Open"
              )}
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex w-full items-center justify-center gap-1.5 px-4 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <Plus className="size-3" />
          New worktree
        </button>
      )}
    </div>
  );
}

function ReviewRequestsBody({
  reviewRequests,
  isLoading,
  isError,
  error,
}: {
  reviewRequests: ReviewRequestedPR[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}) {
  if (isLoading && reviewRequests.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 pb-2">
        <Loader2 className="size-3 animate-spin text-[var(--text-muted)]" />
        <span className="text-xs text-[var(--text-muted)]">Loading...</span>
      </div>
    );
  }

  if (isError && reviewRequests.length === 0) {
    return (
      <div className="px-4 pb-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-3 shrink-0 text-[var(--accent-red)]" />
          <p className="text-xs text-[var(--accent-red)]">
            {error instanceof Error
              ? error.message
              : "Failed to load review requests"}
          </p>
        </div>
      </div>
    );
  }

  if (reviewRequests.length === 0) {
    return (
      <p className="px-4 pb-2 text-xs text-[var(--text-muted)]">
        No review requests
      </p>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto px-2 pb-2">
      {reviewRequests.map((pr) => (
        <ReviewRequestItem key={`${pr.repoName}-${pr.number}`} pr={pr} />
      ))}
    </div>
  );
}

function ReviewRequestsSection() {
  const {
    data: reviewRequests = [],
    isLoading,
    isError,
    error,
  } = useGitHubReviewRequests();
  const isGitHubConnected = useIsGitHubConnected();

  if (!isGitHubConnected) return null;

  return (
    <div className="shrink-0 border-t border-[var(--border-default)]">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1.5">
          <GitPullRequest className="size-3.5 text-[var(--accent-blue)]" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            Review Requests
          </span>
        </div>
        {reviewRequests.length > 0 && (
          <span className="shrink-0 rounded-full bg-[var(--accent-blue)]/20 px-1.5 py-0.5 text-xs text-[var(--accent-blue)]">
            {reviewRequests.length}
          </span>
        )}
      </div>
      <ReviewRequestsBody
        reviewRequests={reviewRequests}
        isLoading={isLoading}
        isError={isError}
        error={error}
      />
    </div>
  );
}

function ReviewRequestItem({ pr }: { pr: ReviewRequestedPR }) {
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-0.5 rounded px-2 py-1.5 hover:bg-[var(--bg-elevated)]"
      title={pr.title}
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
          {pr.isDraft && (
            <span className="mr-1 text-[var(--text-muted)]">[Draft]</span>
          )}
          {pr.title}
        </span>
        <ExternalLink className="size-3 shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
        <span className="truncate">{pr.repoName}</span>
        <span>#{pr.number}</span>
      </div>
    </a>
  );
}

type OrphanSession = TmuxSession & { source: "cmux" | "tmux" };

function OrphanSessionsSection() {
  const repos = useWorkspaceRepos();
  const queryClient = useQueryClient();
  const terminal = useSettingsStore((s) => s.config.terminal);
  const isCmux = terminal === "cmux";

  const [orphanSessions, setOrphanSessions] = useState<OrphanSession[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(
    new Set(),
  );
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);

  const scanForOrphanSessions = useCallback(async () => {
    setScanning(true);
    try {
      // 1. Collect all branches from worktrees
      const allBranches = new Set<string>();
      for (const repo of repos) {
        try {
          const worktrees = await wtList(repo.path);
          // Skip main worktree (index 0)
          for (const wt of worktrees.slice(1)) {
            allBranches.add(wt.branch.toLowerCase());
          }
        } catch {
          // Skip repos that fail
        }
      }

      // 2. Always scan tmux sessions — agents spawned outside cmux
      //    (e.g. Claude Code sub-agents) may create raw tmux sessions
      //    that cmux doesn't track
      const tmuxSessions = await tmuxListSessions();
      const tmuxOrphans: OrphanSession[] = tmuxSessions
        .filter((s) => !allBranches.has(s.name.toLowerCase()))
        .map((s) => ({ ...s, source: "tmux" as const }));

      let orphans = tmuxOrphans;

      if (isCmux) {
        // 3. Also scan cmux workspaces and merge with tmux orphans.
        //    Wrapped in its own try/catch so a cmux failure degrades
        //    gracefully to tmux-only results.
        let cmuxOrphans: OrphanSession[] = [];
        try {
          const cmuxStatuses = await queryTerminals("cmux");
          cmuxOrphans = cmuxStatuses
            .filter((s) => !allBranches.has(s.sessionName.toLowerCase()))
            .map((s) => ({
              name: s.sessionName,
              attached: s.active,
              windows: 1,
              created: "",
              source: "cmux" as const,
            }));
        } catch (e) {
          console.warn(
            "[OrphanScanner] cmux query failed, showing tmux sessions only:",
            e,
          );
        }

        // Deduplicate by name, preferring cmux source when both exist
        const cmuxNames = new Set(cmuxOrphans.map((s) => s.name.toLowerCase()));
        orphans = [
          ...cmuxOrphans,
          ...tmuxOrphans.filter((s) => !cmuxNames.has(s.name.toLowerCase())),
        ];
      }

      setOrphanSessions(orphans);
      setSelectedSessions(new Set(orphans.map((s) => s.name)));

      setShowCleanup(true);
    } catch (e) {
      toastError(e);
    } finally {
      setScanning(false);
    }
  }, [repos, isCmux]);

  const cleanSelectedSessions = useCallback(async () => {
    setCleaning(true);
    const errors: unknown[] = [];
    const killed = new Set<string>();

    for (const session of orphanSessions) {
      if (!selectedSessions.has(session.name)) continue;
      try {
        if (session.source === "cmux") {
          await cmuxCloseWorkspace(session.name);
        } else {
          await tmuxKillSession(session.name);
        }
        killed.add(session.name);
      } catch (e) {
        errors.push(e);
      }
    }

    if (killed.size > 0) {
      const remaining = orphanSessions.filter((s) => !killed.has(s.name));
      setOrphanSessions(remaining);
      setSelectedSessions(
        (prev) => new Set([...prev].filter((n) => !killed.has(n))),
      );
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
    }

    if (errors.length > 0) {
      toastError(new Error(`Failed to kill ${errors.length} session(s)`));
    } else {
      setShowCleanup(false);
    }

    setCleaning(false);
  }, [orphanSessions, selectedSessions, queryClient]);

  function toggleSessionSelection(name: string) {
    setSelectedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  if (repos.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-[var(--border-default)]">
      {showCleanup ? (
        <div className="p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {orphanSessions.length === 0
                ? "No orphan sessions"
                : `${orphanSessions.length} orphan`}
            </span>
            <button
              onClick={() => setShowCleanup(false)}
              className="rounded p-0.5 hover:bg-[var(--bg-elevated)]"
            >
              <X className="size-3 text-[var(--text-muted)]" />
            </button>
          </div>
          {orphanSessions.length > 0 && (
            <div className="space-y-1">
              {orphanSessions.map((session) => (
                <label
                  key={session.name}
                  className="flex cursor-pointer items-center gap-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selectedSessions.has(session.name)}
                    onChange={() => toggleSessionSelection(session.name)}
                    className="rounded border-[var(--border-default)]"
                  />
                  <span className="truncate text-[var(--text-secondary)]">
                    {session.name}
                  </span>
                  {isCmux && (
                    <span className="shrink-0 rounded px-1 text-[10px] text-[var(--text-muted)] bg-[var(--bg-elevated)]">
                      {session.source}
                    </span>
                  )}
                </label>
              ))}
              <button
                onClick={cleanSelectedSessions}
                disabled={cleaning || selectedSessions.size === 0}
                className="mt-1 w-full rounded bg-[var(--accent-red)]/20 px-2 py-1 text-xs text-[var(--accent-red)] hover:bg-[var(--accent-red)]/30 disabled:opacity-50"
              >
                {cleaning
                  ? "Killing..."
                  : `Kill sessions (${selectedSessions.size})`}
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={scanForOrphanSessions}
          disabled={scanning}
          className="flex w-full items-center justify-center gap-1.5 px-4 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {scanning ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Terminal className="size-3" />
          )}
          Clean orphan sessions
        </button>
      )}
    </div>
  );
}

function CleanupSection() {
  const repos = useWorkspaceRepos();
  const queryClient = useQueryClient();
  const terminal = useSettingsStore((s) => s.config.terminal);

  const [staleWorktrees, setStaleWorktrees] = useState<StaleWorktree[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);

  const scanForStale = useCallback(async () => {
    setScanning(true);
    try {
      // Use wt list data directly — mainState reflects merge status
      const repoResults = await Promise.all(
        repos.map(async (repo) => {
          try {
            const worktrees = await wtList(repo.path);
            const repoStale: StaleWorktree[] = [];
            // Skip main worktree (index 0), check mainState for merged/empty
            for (const wt of worktrees.slice(1)) {
              if (wt.mainState === "integrated" || wt.mainState === "empty") {
                repoStale.push({
                  worktree: wt,
                  repoId: repo.id,
                  repoPath: repo.path,
                });
              }
            }
            return repoStale;
          } catch {
            return [];
          }
        }),
      );

      const stale = repoResults.flat();
      setStaleWorktrees(stale);
      setSelected(
        new Set(stale.map((s) => `${s.repoPath}:${s.worktree.branch}`)),
      );
      setShowCleanup(true);
    } catch (e) {
      toastError(e);
    } finally {
      setScanning(false);
    }
  }, [repos]);

  const cleanSelected = useCallback(async () => {
    setCleaning(true);
    try {
      for (const sw of staleWorktrees) {
        const key = `${sw.repoPath}:${sw.worktree.branch}`;
        if (!selected.has(key)) continue;
        try {
          await removeWorktreeFlow({
            repoPath: sw.repoPath,
            branch: sw.worktree.branch,
            sessionName: toSessionName(sw.worktree.branch),
            terminal,
          });
        } catch (err) {
          toastError(err);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
      setShowCleanup(false);
      setStaleWorktrees([]);
      setSelected(new Set());
    } catch (e) {
      toastError(e);
    } finally {
      setCleaning(false);
    }
  }, [staleWorktrees, selected, queryClient, terminal]);

  function toggleSelection(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  if (repos.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-[var(--border-default)]">
      {showCleanup ? (
        <div className="p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {staleWorktrees.length === 0
                ? "No merged worktrees"
                : `${staleWorktrees.length} merged`}
            </span>
            <button
              onClick={() => setShowCleanup(false)}
              className="p-0.5 rounded hover:bg-[var(--bg-elevated)]"
            >
              <X className="size-3 text-[var(--text-muted)]" />
            </button>
          </div>
          {staleWorktrees.length > 0 && (
            <div className="space-y-1">
              {staleWorktrees.map((sw) => {
                const key = `${sw.repoPath}:${sw.worktree.branch}`;
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-xs cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleSelection(key)}
                      className="rounded border-[var(--border-default)]"
                    />
                    <span className="truncate text-[var(--text-secondary)]">
                      {sw.worktree.branch}
                    </span>
                  </label>
                );
              })}
              <button
                onClick={cleanSelected}
                disabled={cleaning || selected.size === 0}
                className="mt-1 w-full rounded bg-[var(--accent-red)]/20 px-2 py-1 text-xs text-[var(--accent-red)] hover:bg-[var(--accent-red)]/30 disabled:opacity-50"
              >
                {cleaning ? "Cleaning..." : `Delete (${selected.size})`}
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={scanForStale}
          disabled={scanning}
          className="flex w-full items-center justify-center gap-1.5 px-4 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {scanning ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Trash2 className="size-3" />
          )}
          Clean merged worktrees
        </button>
      )}
    </div>
  );
}

function ProjectItem({
  project,
  isSelected,
  onSelect,
}: {
  project: Project;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = isSelected ? FolderOpen : Folder;
  const isBacklog = project.statusType === "backlog";

  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2 px-4 py-2 text-left transition-colors ${
        isSelected
          ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
      }`}
    >
      <Icon className={`size-4 shrink-0 ${isBacklog ? "opacity-50" : ""}`} />
      <span className="min-w-0 flex-1 truncate text-sm" title={project.name}>
        {project.name}
      </span>
    </button>
  );
}
