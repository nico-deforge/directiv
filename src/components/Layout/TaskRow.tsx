import { useState, useRef, useEffect } from "react";
import { Play, Square, Loader2, ChevronDown } from "lucide-react";
import type { EnrichedTask, RepoConfig } from "../../types";
import { useStartTask } from "../../hooks/useStartTask";
import { useStopTask, DirtyWorktreeError } from "../../hooks/useStopTask";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTmuxSessions } from "../../hooks/useTmux";

const PRIORITY_COLORS: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-blue-500",
  4: "bg-zinc-500",
};

interface TaskRowProps {
  task: EnrichedTask;
  repos: RepoConfig[];
}

export function TaskRow({ task, repos }: TaskRowProps) {
  const startTask = useStartTask();
  const stopTask = useStopTask();
  const terminal = useSettingsStore((s) => s.config.terminal);
  const { data: sessions } = useTmuxSessions();
  const hasSession = sessions?.some((s) => s.name === task.identifier) ?? false;
  const [error, setError] = useState<string | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const isLoading = startTask.isPending || stopTask.isPending;

  useEffect(() => {
    if (!confirmingStop) return;
    const timer = setTimeout(() => setConfirmingStop(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmingStop]);

  function handleStop(force?: boolean) {
    setError(null);
    setConfirmingStop(false);
    stopTask.mutate(
      {
        identifier: task.identifier,
        repoPaths: repos.map((r) => r.path),
        force,
      },
      {
        onError: (err) => {
          if (err instanceof DirtyWorktreeError) {
            setConfirmingStop(true);
          } else {
            setError(err instanceof Error ? err.message : String(err));
          }
        },
      },
    );
  }

  function handleStart(repoPath: string) {
    setError(null);
    setDropdownOpen(false);
    const repo = repos.find((r) => r.path === repoPath);
    startTask.mutate(
      {
        issueId: task.id,
        identifier: task.identifier,
        repoPath,
        terminal,
        copyPaths: repo?.copyPaths,
        onStart: repo?.onStart,
        baseBranch: repo?.baseBranch,
        fetchBefore: repo?.fetchBefore,
      },
      {
        onError: (err) =>
          setError(err instanceof Error ? err.message : String(err)),
      },
    );
  }

  function handleClick() {
    if (repos.length === 1) {
      handleStart(repos[0].path);
    } else {
      setDropdownOpen((prev) => !prev);
    }
  }

  const priorityColor = PRIORITY_COLORS[task.priority] ?? "bg-zinc-600";

  return (
    <div className="group">
      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/50 rounded-md">
        <span className={`shrink-0 size-2 rounded-full ${priorityColor}`} />
        <a
          href={task.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 font-mono text-xs text-blue-400 hover:underline"
        >
          {task.identifier}
        </a>
        <span className="text-sm text-zinc-300">{task.title}</span>
        <div
          className="relative ml-auto shrink-0 flex items-center gap-1"
          ref={dropdownRef}
        >
          {hasSession &&
            (confirmingStop ? (
              <span className="flex items-center gap-1">
                <span className="text-xs text-yellow-400">Dirty worktree.</span>
                <button
                  onClick={() => handleStop(true)}
                  disabled={isLoading}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Force
                </button>
                <span className="text-xs text-zinc-600">/</span>
                <button
                  onClick={() => setConfirmingStop(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => {
                  handleStop();
                }}
                disabled={isLoading}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-700 disabled:opacity-50"
                title="Stop task (kill session + remove worktree)"
              >
                {stopTask.isPending ? (
                  <Loader2 className="size-4 text-zinc-400 animate-spin" />
                ) : (
                  <Square className="size-4 text-red-400" />
                )}
              </button>
            ))}
          <button
            onClick={handleClick}
            disabled={isLoading || repos.length === 0}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-700 disabled:opacity-50"
            title="Start task"
          >
            {startTask.isPending ? (
              <Loader2 className="size-4 text-zinc-400 animate-spin" />
            ) : repos.length > 1 ? (
              <span className="flex items-center gap-0.5">
                <Play className="size-4 text-green-400" />
                <ChevronDown className="size-3 text-zinc-400" />
              </span>
            ) : (
              <Play className="size-4 text-green-400" />
            )}
          </button>
          {dropdownOpen && repos.length > 1 && (
            <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-lg">
              {repos.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => handleStart(repo.path)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-700"
                >
                  {repo.id}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {error && <p className="px-3 pb-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
