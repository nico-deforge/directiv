import { useState, useRef, useEffect } from "react";
import { Play, Square, Loader2, ChevronDown, Link } from "lucide-react";
import type { EnrichedTask, RepoConfig } from "../../types";
import { useStartTask } from "../../hooks/useStartTask";
import { useStopTask, DirtyWorktreeError } from "../../hooks/useStopTask";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTmuxSessions } from "../../hooks/useTmux";
import { BranchSelector } from "./BranchSelector";

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
  const [selectedRepo, setSelectedRepo] = useState<RepoConfig | null>(null);
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

  function handleClick() {
    setDropdownOpen((prev) => !prev);
    setSelectedRepo(null);
  }

  const priorityColor = PRIORITY_COLORS[task.priority] ?? "bg-zinc-600";

  return (
    <div className="group">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${
          task.isBlocked
            ? "bg-amber-900/10 border-l-2 border-amber-500/50 hover:bg-amber-900/20"
            : "hover:bg-zinc-800/50"
        }`}
      >
        <span className={`shrink-0 size-2 rounded-full ${priorityColor}`} />
        <a
          href={task.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 font-mono text-xs text-blue-400 hover:underline"
        >
          {task.identifier}
        </a>
        <div className="min-w-0 flex-1">
          <span className="text-sm text-zinc-300 truncate block">
            {task.title}
          </span>
          {task.isBlocked && task.blockedBy.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5 text-xs text-amber-500/70">
              <Link className="size-3 shrink-0" />
              <span>Blocked by</span>
              {task.blockedBy.map((b, i) => (
                <span key={b.id}>
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:underline"
                    title={b.title}
                  >
                    {b.identifier}
                  </a>
                  {i < task.blockedBy.length - 1 && ", "}
                </span>
              ))}
            </div>
          )}
        </div>
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
            ) : (
              <span className="flex items-center gap-0.5">
                <Play className="size-4 text-green-400" />
                <ChevronDown className="size-3 text-zinc-400" />
              </span>
            )}
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-lg">
              {repos.length === 1 ? (
                <BranchSelector
                  repoPath={repos[0].path}
                  onSelect={(baseBranch) => handleStart(repos[0].path, baseBranch)}
                />
              ) : selectedRepo ? (
                <BranchSelector
                  repoPath={selectedRepo.path}
                  repoId={selectedRepo.id}
                  onSelect={(baseBranch) => handleStart(selectedRepo.path, baseBranch)}
                  onBack={() => setSelectedRepo(null)}
                />
              ) : (
                <div className="min-w-40">
                  {repos.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => setSelectedRepo(repo)}
                      className="block w-full px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-700"
                    >
                      {repo.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {error && <p className="px-3 pb-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
