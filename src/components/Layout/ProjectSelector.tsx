import { useEffect, useState, useCallback } from "react";
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
  Plus,
  Settings,
  AlertCircle,
} from "lucide-react";
import type { LinearConnectionStatus } from "../../hooks/useLinear";
import { useQueryClient } from "@tanstack/react-query";
import {
  useProjectStore,
  ORPHAN_PROJECT_ID,
  type Project,
} from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWorkspaceRepos } from "../../hooks/useWorkspace";
import {
  worktreeList,
  worktreeCheckMerged,
  worktreeRemove,
  tmuxKillSession,
  tmuxListSessions,
  gitFetchPrune,
} from "../../lib/tauri";
import type {
  StaleWorktree,
  ReviewRequestedPR,
  TmuxSession,
} from "../../types";
import { useGitHubReviewRequests } from "../../hooks/useGitHub";
import { useStartFreeTask } from "../../hooks/useStartTask";
import { WorkspaceSelector } from "./WorkspaceSelector";

interface ProjectSelectorProps {
  projects: Project[];
  hasOrphans: boolean;
  connectionStatus: LinearConnectionStatus;
}

export function ProjectSelector({
  projects,
  hasOrphans,
  connectionStatus,
}: ProjectSelectorProps) {
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const selectProject = useProjectStore((s) => s.selectProject);
  const setProjects = useProjectStore((s) => s.setProjects);
  const queryClient = useQueryClient();

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync projects to store
  useEffect(() => {
    setProjects(projects);
  }, [projects, setProjects]);

  // Auto-select first project if none selected
  useEffect(() => {
    if (selectedProjectId === null && projects.length > 0) {
      selectProject(projects[0].id);
    }
  }, [selectedProjectId, projects, selectProject]);

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["linear"] }),
      queryClient.invalidateQueries({ queryKey: ["github"] }),
      queryClient.invalidateQueries({ queryKey: ["tmux"] }),
      queryClient.invalidateQueries({ queryKey: ["worktrees"] }),
    ]);
    setIsRefreshing(false);
  }

  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-secondary)]">
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
        {connectionStatus.status === "no-token" && (
          <div className="px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--accent-amber)]" />
              <div>
                <p className="text-sm font-medium text-[var(--accent-amber)]">
                  Linear API key missing
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Add VITE_LINEAR_API_KEY to .env.local
                </p>
              </div>
            </div>
          </div>
        )}

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
          projects.length === 0 &&
          !hasOrphans && (
            <p className="px-4 py-2 text-sm text-[var(--text-muted)]">
              No assigned tasks in Linear
            </p>
          )}

        {projects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            isSelected={selectedProjectId === project.id}
            onSelect={() => selectProject(project.id)}
          />
        ))}
        {hasOrphans && (
          <>
            {projects.length > 0 && (
              <div className="mx-3 my-2 border-t border-[var(--border-default)]" />
            )}
            <button
              onClick={() => selectProject(ORPHAN_PROJECT_ID)}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left transition-colors ${
                selectedProjectId === ORPHAN_PROJECT_ID
                  ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <GitBranch className="size-4 shrink-0" />
              <span className="truncate text-sm">Other worktrees</span>
            </button>
          </>
        )}
      </div>
      <ReviewRequestsSection />
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
  const startFreeTask = useStartFreeTask();

  const [showForm, setShowForm] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [selectedRepoIndex, setSelectedRepoIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isValidBranchName = (name: string) =>
    /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(name);

  const canCreate =
    branchName.trim().length > 0 &&
    isValidBranchName(branchName.trim()) &&
    !startFreeTask.isPending;

  async function handleCreate() {
    const repo = repos[selectedRepoIndex];
    startFreeTask.mutate(
      {
        branchName: branchName.trim(),
        repoPath: repo.path,
        terminal,
        copyPaths: repo.copyPaths,
        onStart: repo.onStart,
        baseBranch: repo.baseBranch,
        fetchBefore: repo.fetchBefore,
      },
      {
        onSuccess: () => {
          setShowForm(false);
          setBranchName("");
          setError(null);
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : String(err));
        },
      },
    );
  }

  if (repos.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-[var(--border-default)]">
      {showForm ? (
        <div className="p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              New worktree
            </span>
            <button
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
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
          {error && (
            <p className="mt-1 text-xs text-[var(--accent-red)]">{error}</p>
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

function ReviewRequestsSection() {
  const { data: reviewRequests = [] } = useGitHubReviewRequests();

  if (reviewRequests.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-[var(--border-default)]">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1.5">
          <GitPullRequest className="size-3.5 text-[var(--accent-purple)]" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            Review Requests
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--accent-purple)]/20 px-1.5 py-0.5 text-xs text-[var(--accent-purple)]">
          {reviewRequests.length}
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto px-2 pb-2">
        {reviewRequests.map((pr) => (
          <ReviewRequestItem key={`${pr.repoName}-${pr.number}`} pr={pr} />
        ))}
      </div>
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

function OrphanSessionsSection() {
  const repos = useWorkspaceRepos();
  const queryClient = useQueryClient();

  const [orphanSessions, setOrphanSessions] = useState<TmuxSession[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(
    new Set(),
  );
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanForOrphanSessions = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      // 1. Collect all branches from worktrees
      const allBranches = new Set<string>();
      for (const repo of repos) {
        try {
          const worktrees = await worktreeList(repo.path);
          // Skip main worktree (index 0)
          for (const wt of worktrees.slice(1)) {
            allBranches.add(wt.branch.toLowerCase());
          }
        } catch {
          // Skip repos that fail
        }
      }

      // 2. Get all tmux sessions
      const sessions = await tmuxListSessions();

      // 3. Find orphan sessions (sessions without corresponding worktree)
      const orphans = sessions.filter(
        (s) => !allBranches.has(s.name.toLowerCase()),
      );

      setOrphanSessions(orphans);
      setSelectedSessions(new Set(orphans.map((s) => s.name)));
      setShowCleanup(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }, [repos]);

  const cleanSelectedSessions = useCallback(async () => {
    setCleaning(true);
    setError(null);
    try {
      for (const session of orphanSessions) {
        if (!selectedSessions.has(session.name)) continue;
        await tmuxKillSession(session.name);
      }
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
      setShowCleanup(false);
      setOrphanSessions([]);
      setSelectedSessions(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCleaning(false);
    }
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
          {error && (
            <p className="mt-1 text-xs text-[var(--accent-red)]">{error}</p>
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

  const [staleWorktrees, setStaleWorktrees] = useState<StaleWorktree[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanForStale = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const stale: StaleWorktree[] = [];

      for (const repo of repos) {
        // Fetch and prune to detect deleted remote branches (merged PRs)
        try {
          await gitFetchPrune(repo.path);
        } catch {
          // Continue even if fetch fails (e.g., offline)
        }

        const worktrees = await worktreeList(repo.path);
        // Skip the main worktree (first entry)
        for (const wt of worktrees.slice(1)) {
          try {
            const merged = await worktreeCheckMerged(
              repo.path,
              wt.branch,
              repo.baseBranch,
            );
            if (merged) {
              stale.push({
                worktree: wt,
                repoId: repo.id,
                repoPath: repo.path,
              });
            }
          } catch {
            // Skip branches that can't be checked
          }
        }
      }
      setStaleWorktrees(stale);
      setSelected(
        new Set(stale.map((s) => `${s.repoPath}:${s.worktree.branch}`)),
      );
      setShowCleanup(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }, [repos]);

  const cleanSelected = useCallback(async () => {
    setCleaning(true);
    setError(null);
    try {
      for (const sw of staleWorktrees) {
        const key = `${sw.repoPath}:${sw.worktree.branch}`;
        if (!selected.has(key)) continue;
        // Kill tmux session if one exists for this branch
        try {
          await tmuxKillSession(sw.worktree.branch);
        } catch {
          // Session may not exist
        }
        // Remove worktree + delete branch
        await worktreeRemove(
          sw.repoPath,
          sw.worktree.path,
          sw.worktree.branch,
          true,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
      setShowCleanup(false);
      setStaleWorktrees([]);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCleaning(false);
    }
  }, [staleWorktrees, selected, queryClient]);

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
          {error && (
            <p className="mt-1 text-xs text-[var(--accent-red)]">{error}</p>
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

  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2 px-4 py-2 text-left transition-colors ${
        isSelected
          ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
      }`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
      <span className="shrink-0 rounded-full bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
        {project.taskCount}
      </span>
    </button>
  );
}
