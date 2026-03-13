import type { Node, NodeProps } from "@xyflow/react";
import { Folder } from "lucide-react";
import { CARD_WIDTH, H_GAP } from "../../lib/graphLayout";

export type GroupLabelNodeData = {
  label: string;
};

export type GroupLabelNodeType = Node<GroupLabelNodeData, "groupLabel">;

const LABEL_WIDTH = 3 * (CARD_WIDTH + H_GAP) - H_GAP;

export function GroupLabelNode({ data }: NodeProps<GroupLabelNodeType>) {
  return (
    <div
      className="nodrag nopan flex items-center gap-2 border-b border-[var(--border-default)] pb-2"
      style={{ width: LABEL_WIDTH }}
    >
      <Folder className="size-4 text-[var(--text-muted)]" />
      <span className="text-sm font-semibold text-[var(--text-primary)]">
        {data.label}
      </span>
    </div>
  );
}
