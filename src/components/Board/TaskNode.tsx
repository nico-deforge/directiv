import type { Node, NodeProps } from "@xyflow/react";
import { GitPullRequest } from "lucide-react";

const PRIORITY_COLORS: Record<number, string> = {
  0: "bg-zinc-600", // No priority
  1: "bg-red-500", // Urgent
  2: "bg-orange-500", // High
  3: "bg-yellow-500", // Medium
  4: "bg-blue-500", // Low
};

export type ReviewStatus =
  | "approved"
  | "changes_requested"
  | "commented"
  | "pending";

const REVIEW_LABELS: Record<
  ReviewStatus,
  { label: string; className: string }
> = {
  approved: { label: "Approved", className: "bg-green-500/20 text-green-400" },
  commented: {
    label: "Commented",
    className: "bg-blue-500/20 text-blue-400",
  },
  changes_requested: {
    label: "Changes",
    className: "bg-orange-500/20 text-orange-400",
  },
  pending: { label: "Pending", className: "bg-zinc-500/20 text-zinc-400" },
};

export type TaskNodeData = {
  identifier: string;
  title: string;
  priority: number;
  url: string;
  prUrl?: string;
  reviewStatus?: ReviewStatus;
  projectName?: string;
};

export type TaskNodeType = Node<TaskNodeData, "task">;

export function TaskNode({ data }: NodeProps<TaskNodeType>) {
  const dot = PRIORITY_COLORS[data.priority] ?? "bg-zinc-600";

  return (
    <div className="w-[320px] rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="nodrag nopan text-xs font-medium text-zinc-400 hover:text-zinc-200"
            >
              {data.identifier}
            </a>
            {data.prUrl && (
              <a
                href={data.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="nodrag nopan text-zinc-500 hover:text-purple-400"
                title="Pull Request"
              >
                <GitPullRequest className="size-3.5" />
              </a>
            )}
            {data.reviewStatus && (
              <span
                className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${REVIEW_LABELS[data.reviewStatus].className}`}
              >
                {REVIEW_LABELS[data.reviewStatus].label}
              </span>
            )}
          </div>
          <p className="line-clamp-3 text-sm text-zinc-200">{data.title}</p>
          {data.projectName && (
            <span className="mt-1 inline-block text-xs text-zinc-500">
              {data.projectName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
