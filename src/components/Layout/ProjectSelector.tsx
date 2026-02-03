import { useEffect, useState, useCallback } from "react";
import {
  Folder,
  FolderOpen,
  GitBranch,
  RefreshCw,
  Trash2,
  Loader2,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useProjectStore,
  ORPHAN_PROJECT_ID,
  type Project,
} from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  worktreeList,
  worktreeCheckMerged,
  worktreeRemove,
  tmuxKillSession,
} from "../../lib/tauri";
import type { StaleWorktree } from "../../types";

interface ProjectSelectorProps {
  projects: Project[];
  hasOrphans: boolean;
}

export function ProjectSelector({ projects, hasOrphans }: ProjectSelectorProps) {
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
    <aside className="flex w-[200px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Projects</h2>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
            title="Refresh all data"
          >
            <RefreshCw
              className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {projects.length === 0 && !hasOrphans && (
          <p className="px-4 py-2 text-sm text-zinc-500">No projects found</p>
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
              <div className="mx-3 my-2 border-t border-zinc-800" />
            )}
            <button
              onClick={() => selectProject(ORPHAN_PROJECT_ID)}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left transition-colors ${
                selectedProjectId === ORPHAN_PROJECT_ID
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              <GitBranch className="size-4 shrink-0" />
              <span className="truncate text-sm">Other worktrees</span>
            </button>
          </>
        )}
      </div>
      <CleanupSection />
    </aside>
  );
}

function CleanupSection() {
  const repos = useSettingsStore((s) => s.config.repos);
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
    <div className="shrink-0 border-t border-zinc-800">
      {showCleanup ? (
        <div className="p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-300">
              {staleWorktrees.length === 0
                ? "No merged worktrees"
                : `${staleWorktrees.length} merged`}
            </span>
            <button
              onClick={() => setShowCleanup(false)}
              className="p-0.5 rounded hover:bg-zinc-700"
            >
              <X className="size-3 text-zinc-400" />
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
                      className="rounded border-zinc-600"
                    />
                    <span className="truncate text-zinc-300">
                      {sw.worktree.branch}
                    </span>
                  </label>
                );
              })}
              <button
                onClick={cleanSelected}
                disabled={cleaning || selected.size === 0}
                className="mt-1 w-full rounded bg-red-900/50 px-2 py-1 text-xs text-red-300 hover:bg-red-900/70 disabled:opacity-50"
              >
                {cleaning ? "Cleaning..." : `Delete (${selected.size})`}
              </button>
            </div>
          )}
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <button
          onClick={scanForStale}
          disabled={scanning}
          className="flex w-full items-center justify-center gap-1.5 px-4 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
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
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
      }`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
      <span className="shrink-0 rounded-full bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-400">
        {project.taskCount}
      </span>
    </button>
  );
}
