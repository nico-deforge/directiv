import { Loader2, Inbox, RefreshCw } from "lucide-react";
import { useLinearAllMyTasks } from "../../hooks/useLinear";
import { useSettingsStore } from "../../stores/settingsStore";
import { linearClient } from "../../lib/linear";
import { TaskRow } from "./TaskRow";
import type { EnrichedTask } from "../../types";

export function Sidebar() {
  const config = useSettingsStore((s) => s.config);
  const teamIds = config.linear.teamIds;
  const repos = config.repos;

  const { data: tasks, isLoading, isError, error, refetch } = useLinearAllMyTasks(teamIds);

  if (!linearClient) {
    return (
      <aside className="flex w-80 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <Header />
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-sm text-zinc-500">
            Set <code className="text-zinc-400">VITE_LINEAR_API_KEY</code> to load tasks.
          </p>
        </div>
      </aside>
    );
  }

  if (teamIds.length === 0) {
    return (
      <aside className="flex w-80 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <Header />
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-sm text-zinc-500">
            Configure <code className="text-zinc-400">linear.teamIds</code> in settings.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      <Header />
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

function Header() {
  return (
    <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
      <h2 className="text-sm font-semibold text-zinc-200">Tasks</h2>
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
  const grouped = new Map<string, EnrichedTask[]>();

  for (const task of tasks) {
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
            <span className="text-xs font-medium text-zinc-400">{projectName}</span>
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
