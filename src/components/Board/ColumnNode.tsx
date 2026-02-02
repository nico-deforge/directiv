import type { Node, NodeProps } from "@xyflow/react";

export type ColumnNodeData = {
  label: string;
  count: number;
};

export type ColumnNodeType = Node<ColumnNodeData, "column">;

export function ColumnNode({ data }: NodeProps<ColumnNodeType>) {
  return (
    <div className="flex w-[350px] items-center gap-2 rounded-md bg-zinc-900 px-4 py-2">
      <span className="text-sm font-semibold text-zinc-300">{data.label}</span>
      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
        {data.count}
      </span>
    </div>
  );
}
