import { useEffect, useMemo } from "react";
import { ReactFlow, useNodesState, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useLinearAllMyTasks } from "../../hooks/useLinear";
import { useTmuxSessions } from "../../hooks/useTmux";
import { useGitHubMyOpenPRs } from "../../hooks/useGitHub";
import { useSettingsStore } from "../../stores/settingsStore";
import { TaskNode, type TaskNodeData } from "./TaskNode";
import { ColumnNode, type ColumnNodeData } from "./ColumnNode";
import type {
  EnrichedTask,
  TmuxSession,
  PullRequestInfo,
} from "../../types";

const nodeTypes = { task: TaskNode, column: ColumnNode };

const ROW_START_Y = 50;
const ROW_HEIGHT = 60;

function buildNodes(
  tasks: EnrichedTask[],
  sessions: TmuxSession[],
  prs: PullRequestInfo[],
): Node[] {
  const sessionNames = new Set(sessions.map((s) => s.name));

  // Build a map: task identifier → PR (first match, any state)
  const prByTask = new Map<string, PullRequestInfo>();
  for (const pr of prs) {
    for (const task of tasks) {
      if (
        pr.branch.toLowerCase().includes(task.identifier.toLowerCase()) &&
        !prByTask.has(task.identifier)
      ) {
        prByTask.set(task.identifier, pr);
      }
    }
  }

  // Tasks with active session
  const withSession = tasks.filter((t) => sessionNames.has(t.identifier));

  // In Review: has PR, not draft, at least 1 requested reviewer
  const inReview = withSession.filter((t) => {
    const pr = prByTask.get(t.identifier);
    return pr && !pr.draft && pr.requestedReviewerCount >= 1;
  });
  const inReviewIds = new Set(inReview.map((t) => t.identifier));

  // Personal Review: has PR but not in "In Review" (draft OR no reviewers)
  const personalReview = withSession.filter(
    (t) => prByTask.has(t.identifier) && !inReviewIds.has(t.identifier),
  );

  // In Dev: has session but no PR
  const inDev = withSession.filter((t) => !prByTask.has(t.identifier));

  const nodes: Node[] = [];

  // In Dev column at x=0
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

  // Personal Review column at x=370
  nodes.push({
    id: "col-personal-review",
    type: "column",
    position: { x: 370, y: 0 },
    data: {
      label: "Personal Review",
      count: personalReview.length,
    } satisfies ColumnNodeData,
    draggable: false,
    selectable: false,
  });

  personalReview.forEach((task, i) => {
    const pr = prByTask.get(task.identifier);
    nodes.push({
      id: task.id,
      type: "task",
      position: { x: 370, y: ROW_START_Y + i * ROW_HEIGHT },
      data: {
        identifier: task.identifier,
        title: task.title,
        priority: task.priority,
        url: task.url,
        prUrl: pr?.url,
      } satisfies TaskNodeData,
      draggable: false,
    });
  });

  // In Review column at x=740
  nodes.push({
    id: "col-inreview",
    type: "column",
    position: { x: 740, y: 0 },
    data: {
      label: "In Review",
      count: inReview.length,
    } satisfies ColumnNodeData,
    draggable: false,
    selectable: false,
  });

  inReview.forEach((task, i) => {
    const pr = prByTask.get(task.identifier);
    nodes.push({
      id: task.id,
      type: "task",
      position: { x: 740, y: ROW_START_Y + i * ROW_HEIGHT },
      data: {
        identifier: task.identifier,
        title: task.title,
        priority: task.priority,
        url: task.url,
        prUrl: pr?.url,
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
  const { data: prs } = useGitHubMyOpenPRs();

  const nextNodes = useMemo(
    () => buildNodes(tasks ?? [], sessions ?? [], prs ?? []),
    [tasks, sessions, prs],
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
