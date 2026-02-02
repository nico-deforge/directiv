import { useEffect, useMemo } from "react";
import { ReactFlow, useNodesState, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useLinearAllMyTasks } from "../../hooks/useLinear";
import { useTmuxSessions } from "../../hooks/useTmux";
import { useSettingsStore } from "../../stores/settingsStore";
import { TaskNode, type TaskNodeData } from "./TaskNode";
import { ColumnNode, type ColumnNodeData } from "./ColumnNode";
import type { EnrichedTask, TmuxSession } from "../../types";

const nodeTypes = { task: TaskNode, column: ColumnNode };

const ROW_START_Y = 50;
const ROW_HEIGHT = 60;

function buildNodes(tasks: EnrichedTask[], sessions: TmuxSession[]): Node[] {
  const sessionNames = new Set(sessions.map((s) => s.name));
  const inDev = tasks.filter((t) => sessionNames.has(t.identifier));

  const nodes: Node[] = [];

  nodes.push({
    id: "col-indev",
    type: "column",
    position: { x: 0, y: 0 },
    data: { label: "In Dev", count: inDev.length } satisfies ColumnNodeData,
    draggable: false,
    selectable: false,
  });

  inDev.forEach((task, i) => {
    nodes.push({
      id: task.id,
      type: "task",
      position: { x: 0, y: ROW_START_Y + i * ROW_HEIGHT },
      data: {
        identifier: task.identifier,
        title: task.title,
        priority: task.priority,
        url: task.url,
      } satisfies TaskNodeData,
      draggable: false,
    });
  });

  return nodes;
}

export function WorkflowBoard() {
  const teamIds = useSettingsStore((s) => s.config.linear.teamIds);
  const { data: tasks } = useLinearAllMyTasks(teamIds);
  const { data: sessions } = useTmuxSessions();

  const nextNodes = useMemo(
    () => buildNodes(tasks ?? [], sessions ?? []),
    [tasks, sessions],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  useEffect(() => {
    setNodes(nextNodes);
  }, [nextNodes, setNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      colorMode="dark"
      fitView
      proOptions={{ hideAttribution: true }}
      panOnScroll
      zoomOnDoubleClick={false}
      minZoom={0.5}
      maxZoom={1.5}
    />
  );
}
