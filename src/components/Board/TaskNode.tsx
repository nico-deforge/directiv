import type { Node, NodeProps } from "@xyflow/react";

const PRIORITY_COLORS: Record<number, string> = {
  0: "bg-zinc-600", // No priority
  1: "bg-red-500", // Urgent
  2: "bg-orange-500", // High
  3: "bg-yellow-500", // Medium
  4: "bg-blue-500", // Low
};

export type TaskNodeData = {
  identifier: string;
  title: string;
  priority: number;
  url: string;
};

export type TaskNodeType = Node<TaskNodeData, "task">;

export function TaskNode({ data }: NodeProps<TaskNodeType>) {
  const dot = PRIORITY_COLORS[data.priority] ?? "bg-zinc-600";

  return (
    <div className="w-[320px] rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0">
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-zinc-400 hover:text-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            {data.identifier}
          </a>
          <p className="truncate text-sm text-zinc-200">{data.title}</p>
        </div>
      </div>
    </div>
  );
}
