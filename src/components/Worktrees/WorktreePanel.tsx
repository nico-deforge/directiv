import { useState, useCallback, useMemo } from "react";
import { GitBranch, Trash2, Loader2, X } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { RepoWorktreeGroup } from "./RepoWorktreeGroup";
import {
  worktreeList,
  worktreeCheckMerged,
  worktreeRemove,
  tmuxKillSession,
} from "../../lib/tauri";
import { useTmuxSessions } from "../../hooks/useTmux";
import { useQueryClient } from "@tanstack/react-query";
import type { StaleWorktree, TmuxSession } from "../../types";

export function WorktreePanel() {
  const repos = useSettingsStore((s) => s.config.repos);
  const queryClient = useQueryClient();
  const { data: tmuxSessions } = useTmuxSessions();
  const sessionsByName = useMemo(() => {
    const map = new Map<string, TmuxSession>();
    for (const s of tmuxSessions ?? []) map.set(s.name, s);
    return map;
  }, [tmuxSessions]);
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

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-900">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <GitBranch className="size-4" />
            Worktrees
          </h2>
          {repos.length > 0 && (
            <button
              onClick={scanForStale}
              disabled={scanning}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
              title="Find merged worktrees to clean up"
            >
              {scanning ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Trash2 className="size-3" />
              )}
              Clean up
            </button>
          )}
        </div>
      </div>

      {showCleanup && (
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs font-medium text-zinc-300">
              {staleWorktrees.length === 0
                ? "No merged worktrees found"
                : `${staleWorktrees.length} merged worktree(s)`}
            </span>
            <button
              onClick={() => setShowCleanup(false)}
              className="p-0.5 rounded hover:bg-zinc-700"
            >
              <X className="size-3 text-zinc-400" />
            </button>
          </div>
          {staleWorktrees.length > 0 && (
            <div className="px-4 pb-2 space-y-1">
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
                    <span className="ml-auto shrink-0 rounded bg-green-900/50 px-1 py-0.5 text-[10px] text-green-400">
                      merged
                    </span>
                  </label>
                );
              })}
              <button
                onClick={cleanSelected}
                disabled={cleaning || selected.size === 0}
                className="mt-1 w-full rounded bg-red-900/50 px-2 py-1 text-xs text-red-300 hover:bg-red-900/70 disabled:opacity-50"
              >
                {cleaning ? "Cleaning…" : `Clean selected (${selected.size})`}
              </button>
            </div>
          )}
          {error && <p className="px-4 pb-2 text-xs text-red-400">{error}</p>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {repos.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <p className="text-center text-sm text-zinc-500">
              Configure <code className="text-zinc-400">repos</code> in
              settings.
            </p>
          </div>
        ) : (
          <div className="py-2">
            {repos.map((repo) => (
              <RepoWorktreeGroup
                key={repo.id}
                repo={repo}
                sessionsByName={sessionsByName}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
