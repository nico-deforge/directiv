import { useState, useRef, useEffect } from "react";
import { Loader2, Inbox, RefreshCw, Plus } from "lucide-react";
import { useLinearAllMyTasks } from "../../hooks/useLinear";
import { useSettingsStore } from "../../stores/settingsStore";
import { linearClient } from "../../lib/linear";
import { useStartFreeTask } from "../../hooks/useStartTask";
import { TaskRow } from "./TaskRow";
import type { EnrichedTask } from "../../types";

function validateBranchName(name: string): string | null {
  if (!name) return "Branch name is required";
  if (/\s/.test(name)) return "No spaces allowed";
  if (/[~^:?*[\]\\]/.test(name)) return "Contains forbidden characters";
  if (/[.:]/.test(name)) return "Dots and colons not allowed (tmux compat)";
  if (name.startsWith("-") || name.startsWith("/"))
    return "Cannot start with - or /";
  if (name.endsWith(".lock") || name.endsWith(".") || name.endsWith("/"))
    return "Invalid ending (.lock, ., /)";
  if (name.includes("..") || name.includes("//"))
    return "No .. or // sequences";
  return null;
}

export function Sidebar() {
  const config = useSettingsStore((s) => s.config);
  const teamIds = config.linear.teamIds;
  const repos = config.repos;

  const {
    data: tasks,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useLinearAllMyTasks(teamIds);

  if (!linearClient) {
    return (
      <aside className="flex w-[28rem] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <Header refetch={refetch} isFetching={isFetching} />
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-sm text-zinc-500">
            Set <code className="text-zinc-400">VITE_LINEAR_API_KEY</code> to
            load tasks.
          </p>
        </div>
      </aside>
    );
  }

  if (teamIds.length === 0) {
    return (
      <aside className="flex w-[28rem] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <Header refetch={refetch} isFetching={isFetching} />
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-sm text-zinc-500">
            Configure <code className="text-zinc-400">linear.teamIds</code> in
            settings.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-[28rem] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      <Header refetch={refetch} isFetching={isFetching} />
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 text-zinc-500 animate-spin" />
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center gap-2 py-12 px-4">
            <p className="text-sm text-red-400 text-center">
              {error instanceof Error ? error.message : "Failed to load tasks"}
            </p>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              <RefreshCw className="size-3" /> Retry
            </button>
          </div>
        )}
        {!isLoading && !isError && tasks && tasks.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12">
            <Inbox className="size-8 text-zinc-600" />
            <p className="text-sm text-zinc-500">No tasks assigned</p>
          </div>
        )}
        {!isLoading && !isError && tasks && tasks.length > 0 && (
          <TaskGroups tasks={tasks} repos={repos} />
        )}
      </div>
    </aside>
  );
}

function Header({
  refetch,
  isFetching,
}: {
  refetch: () => void;
  isFetching: boolean;
}) {
  const repos = useSettingsStore((s) => s.config.repos);
  const terminal = useSettingsStore((s) => s.config.terminal);
  const [open, setOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const startFreeTask = useStartFreeTask();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open && repos.length > 0 && !selectedRepo) {
      setSelectedRepo(repos[0].path);
    }
  }, [open, repos, selectedRepo]);

  function resetAndClose() {
    setOpen(false);
    setBranchName("");
    setSelectedRepo("");
    setValidationError(null);
    startFreeTask.reset();
  }

  function handleSubmit() {
    const error = validateBranchName(branchName);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    const repo = repos.find((r) => r.path === selectedRepo);
    startFreeTask.mutate(
      {
        branchName,
        repoPath: selectedRepo,
        terminal,
        copyPaths: repo?.copyPaths,
        onStart: repo?.onStart,
        baseBranch: repo?.baseBranch,
        fetchBefore: repo?.fetchBefore,
      },
      {
        onSuccess: () => resetAndClose(),
        onError: () => {},
      },
    );
  }

  return (
    <div
      className="relative shrink-0 border-b border-zinc-800 px-4 py-3"
      ref={popoverRef}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Tasks</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
            title="Refresh tasks"
          >
            <RefreshCw
              className={`size-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
          </button>
          {repos.length > 0 && (
            <button
              onClick={() => (open ? resetAndClose() : setOpen(true))}
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              title="Start free task"
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-2 rounded-md border border-zinc-700 bg-zinc-800 p-3">
          {repos.length > 1 && (
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              className="mb-2 w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 outline-none focus:border-blue-500"
            >
              {repos.map((r) => (
                <option key={r.id} value={r.path}>
                  {r.id}
                </option>
              ))}
            </select>
          )}
          <input
            autoFocus
            type="text"
            value={branchName}
            onChange={(e) => {
              setBranchName(e.target.value);
              setValidationError(null);
              startFreeTask.reset();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") resetAndClose();
            }}
            placeholder="branch-name"
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500"
          />
          {validationError && (
            <p className="mt-1 text-xs text-red-400">{validationError}</p>
          )}
          {startFreeTask.isError && (
            <p className="mt-1 text-xs text-red-400">
              {startFreeTask.error instanceof Error
                ? startFreeTask.error.message
                : "Failed to start task"}
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={startFreeTask.isPending}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {startFreeTask.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Starting…
              </>
            ) : (
              "Start"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function TaskGroups({
  tasks,
  repos,
}: {
  tasks: EnrichedTask[];
  repos: { id: string; path: string }[];
}) {
  const visibleTasks = tasks.filter(
    (t) => !t.isBlocked && !t.status.toLowerCase().includes("block"),
  );
  const grouped = new Map<string, EnrichedTask[]>();

  for (const task of visibleTasks) {
    const key = task.projectName ?? "No Project";
    const group = grouped.get(key) ?? [];
    group.push(task);
    grouped.set(key, group);
  }

  // Sort groups: named projects first, "No Project" last
  const entries = [...grouped.entries()].sort(([a], [b]) => {
    if (a === "No Project") return 1;
    if (b === "No Project") return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="py-2">
      {entries.map(([projectName, projectTasks]) => (
        <div key={projectName}>
          <div className="sticky top-0 z-10 flex items-center gap-2 bg-zinc-900 px-4 py-2">
            <span className="text-xs font-medium text-zinc-400">
              {projectName}
            </span>
            <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
              {projectTasks.length}
            </span>
          </div>
          <div className="px-1">
            {projectTasks.map((task) => (
              <TaskRow key={task.id} task={task} repos={repos} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
