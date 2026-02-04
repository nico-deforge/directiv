import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  type Node,
  type Edge,
  type Connection,
  type EdgeMouseHandler,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  useLinearAllMyTasks,
  useLinearConnectionStatus,
  type LinearConnectionStatus,
} from "../../hooks/useLinear";
import { useTmuxSessions } from "../../hooks/useTmux";
import { useGitHubMyOpenPRs } from "../../hooks/useGitHub";
import { useAllWorktrees } from "../../hooks/useWorktrees";
import {
  useCreateBlockedBy,
  useDeleteBlockedBy,
} from "../../hooks/useBlockedByMutations";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWorkspaceRepos } from "../../hooks/useWorkspace";
import {
  useProjectStore,
  ORPHAN_PROJECT_ID,
  type Project,
} from "../../stores/projectStore";
import { UnifiedTaskCard, type UnifiedTaskNodeData } from "./UnifiedTaskCard";
import { OrphanTaskCard, type OrphanTaskNodeData } from "./OrphanTaskCard";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  calculatePositions,
  calculateEdges,
  CARD_WIDTH,
  CARD_HEIGHT,
  H_GAP,
  V_GAP,
} from "../../lib/graphLayout";
import type {
  TmuxSession,
  PullRequestInfo,
  WorktreeInfo,
  OrphanWorktree,
} from "../../types";

interface EdgeWithRelation extends Edge {
  data?: { relationId: string; targetIssueId: string };
}

const nodeTypes = {
  unifiedTask: UnifiedTaskCard,
  orphanTask: OrphanTaskCard,
};

interface DependencyGraphProps {
  onProjectsChange: (
    projects: Project[],
    hasOrphans: boolean,
    connectionStatus: LinearConnectionStatus,
  ) => void;
}

export function DependencyGraph({ onProjectsChange }: DependencyGraphProps) {
  const config = useSettingsStore((s) => s.config);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const teamIds = config.linear.teamIds;
  const repos = useWorkspaceRepos();

  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);

  const {
    data: tasks,
    isLoading: tasksLoading,
    error: tasksError,
  } = useLinearAllMyTasks(teamIds);
  const connectionStatus = useLinearConnectionStatus(
    teamIds,
    tasksLoading,
    tasksError,
  );
  const { data: sessions } = useTmuxSessions();
  const { data: prs } = useGitHubMyOpenPRs();
  const { data: allWorktrees } = useAllWorktrees(repos);

  const createBlockedBy = useCreateBlockedBy();
  const deleteBlockedBy = useDeleteBlockedBy();

  const [edgeToDelete, setEdgeToDelete] = useState<EdgeWithRelation | null>(
    null,
  );

  // Build lookup maps
  const sessionByName = useMemo(() => {
    const map = new Map<string, TmuxSession>();
    for (const s of sessions ?? []) map.set(s.name, s);
    return map;
  }, [sessions]);

  const prByBranch = useMemo(() => {
    const map = new Map<string, PullRequestInfo>();
    for (const pr of prs ?? []) {
      map.set(pr.branch.toLowerCase(), pr);
    }
    return map;
  }, [prs]);

  const worktreeByBranch = useMemo(() => {
    const map = new Map<
      string,
      { worktree: WorktreeInfo; repoId: string; repoPath: string }
    >();
    for (const rw of allWorktrees ?? []) {
      // Skip main worktree (index 0)
      for (const wt of rw.worktrees.slice(1)) {
        map.set(wt.branch.toLowerCase(), {
          worktree: wt,
          repoId: rw.repoId,
          repoPath: rw.repoPath,
        });
      }
    }
    return map;
  }, [allWorktrees]);

  // Extract projects from tasks
  const projectsFromTasks = useMemo(() => {
    const projectMap = new Map<string, { name: string; count: number }>();

    for (const task of tasks ?? []) {
      // Skip done tasks
      if (
        task.status.toLowerCase().includes("done") ||
        task.status.toLowerCase().includes("completed")
      ) {
        continue;
      }

      const projectId = task.projectId ?? "__no_project__";
      const projectName = task.projectName ?? "No Project";

      const existing = projectMap.get(projectId);
      if (existing) {
        existing.count++;
      } else {
        projectMap.set(projectId, { name: projectName, count: 1 });
      }
    }

    const projects: Project[] = [];
    for (const [id, data] of projectMap.entries()) {
      projects.push({ id, name: data.name, taskCount: data.count });
    }

    // Sort: named projects first, "No Project" last
    projects.sort((a, b) => {
      if (a.id === "__no_project__") return 1;
      if (b.id === "__no_project__") return -1;
      return a.name.localeCompare(b.name);
    });

    return projects;
  }, [tasks]);

  // Find orphan worktrees (not linked to any task)
  const orphanWorktrees = useMemo(() => {
    const taskIdentifiers = new Set(
      (tasks ?? []).map((t) => t.identifier.toLowerCase()),
    );

    const orphans: OrphanWorktree[] = [];
    for (const rw of allWorktrees ?? []) {
      // Skip main worktree (index 0)
      for (const wt of rw.worktrees.slice(1)) {
        if (!taskIdentifiers.has(wt.branch.toLowerCase())) {
          orphans.push({
            worktree: wt,
            repoId: rw.repoId,
            repoPath: rw.repoPath,
            session: sessionByName.get(wt.branch) ?? null,
          });
        }
      }
    }
    return orphans;
  }, [tasks, allWorktrees, sessionByName]);

  const hasOrphans = orphanWorktrees.length > 0;

  // Notify parent of project changes
  useEffect(() => {
    onProjectsChange(projectsFromTasks, hasOrphans, connectionStatus);
  }, [projectsFromTasks, hasOrphans, connectionStatus, onProjectsChange]);

  // Filter tasks for selected project
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];

    return tasks.filter((task) => {
      // Exclude done tasks
      if (
        task.status.toLowerCase().includes("done") ||
        task.status.toLowerCase().includes("completed")
      ) {
        return false;
      }

      // Filter by project
      if (selectedProjectId === null) return true;
      if (selectedProjectId === ORPHAN_PROJECT_ID) return false;

      const taskProjectId = task.projectId ?? "__no_project__";
      return taskProjectId === selectedProjectId;
    });
  }, [tasks, selectedProjectId]);

  // Build nodes and edges
  const { nextNodes, nextEdges } = useMemo(() => {
    // Show orphans if orphan project selected
    if (selectedProjectId === ORPHAN_PROJECT_ID) {
      const orphanNodes: Node<OrphanTaskNodeData>[] = orphanWorktrees.map(
        (orphan, index) => ({
          id: `orphan-${orphan.worktree.branch}`,
          type: "orphanTask",
          position: {
            x: (index % 3) * (CARD_WIDTH + H_GAP),
            y: Math.floor(index / 3) * (CARD_HEIGHT + V_GAP),
          },
          data: {
            worktree: orphan.worktree,
            session: orphan.session,
            repoId: orphan.repoId,
            repoPath: orphan.repoPath,
          },
          draggable: false,
        }),
      );
      return { nextNodes: orphanNodes, nextEdges: [] };
    }

    // Calculate positions for dependency graph
    const positions = calculatePositions(filteredTasks);
    const positionById = new Map(positions.map((p) => [p.id, p]));

    const taskNodes: Node<UnifiedTaskNodeData>[] = filteredTasks.map((task) => {
      const pos = positionById.get(task.id) ?? { x: 0, y: 0 };
      const wtInfo = worktreeByBranch.get(task.identifier.toLowerCase());
      const pr =
        prByBranch.get(task.identifier.toLowerCase()) ??
        (wtInfo ? prByBranch.get(wtInfo.worktree.branch.toLowerCase()) : null);

      return {
        id: task.id,
        type: "unifiedTask",
        position: { x: pos.x, y: pos.y },
        data: {
          task,
          worktree: wtInfo?.worktree ?? null,
          worktreeRepoPath: wtInfo?.repoPath ?? null,
          session: sessionByName.get(task.identifier) ?? null,
          pullRequest: pr ?? null,
          repos,
        },
        draggable: false,
      };
    });

    // Calculate edges for blocking relationships
    const edgeData = calculateEdges(filteredTasks);
    // Use static amber color that matches our accent
    const edgeColor = resolvedTheme === "dark" ? "#f59e0b" : "#d97706";
    const taskEdges: EdgeWithRelation[] = edgeData.map((e, index) => ({
      id: `edge-${index}`,
      source: e.source,
      target: e.target,
      data: { relationId: e.relationId, targetIssueId: e.target },
      type: "smoothstep",
      style: { stroke: edgeColor, strokeWidth: 2, cursor: "pointer" },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeColor,
      },
    }));

    return { nextNodes: taskNodes, nextEdges: taskEdges };
  }, [
    selectedProjectId,
    filteredTasks,
    orphanWorktrees,
    worktreeByBranch,
    prByBranch,
    sessionByName,
    repos,
    resolvedTheme,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [nextNodes, nextEdges, setNodes, setEdges]);

  // Build task lookup for optimistic updates
  const taskById = useMemo(() => {
    const map = new Map<string, (typeof filteredTasks)[0]>();
    for (const task of filteredTasks) {
      map.set(task.id, task);
    }
    return map;
  }, [filteredTasks]);

  // Handle new connections (create blocked-by relation)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      // Prevent self-connection
      if (connection.source === connection.target) return;

      const blockerTask = taskById.get(connection.source);
      if (!blockerTask) return;

      // source = blocker, target = blocked
      createBlockedBy.mutate({
        blockerIssueId: connection.source,
        targetIssueId: connection.target,
        blockerInfo: {
          id: blockerTask.id,
          identifier: blockerTask.identifier,
          title: blockerTask.title,
          url: blockerTask.url,
        },
      });
    },
    [createBlockedBy, taskById],
  );

  // Handle edge click (delete blocked-by relation with confirmation)
  const onEdgeClick: EdgeMouseHandler = useCallback((_event, edge) => {
    setEdgeToDelete(edge as EdgeWithRelation);
  }, []);

  const confirmDeleteEdge = useCallback(() => {
    if (!edgeToDelete?.data?.relationId || !edgeToDelete?.data?.targetIssueId)
      return;
    // Close dialog immediately (optimistic)
    setEdgeToDelete(null);
    deleteBlockedBy.mutate({
      relationId: edgeToDelete.data.relationId,
      targetIssueId: edgeToDelete.data.targetIssueId,
    });
  }, [edgeToDelete, deleteBlockedBy]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={{
          type: "smoothstep",
        }}
        colorMode={resolvedTheme}
        fitView
        fitViewOptions={{ padding: 0.1, minZoom: 0.8, maxZoom: 1.2 }}
        proOptions={{ hideAttribution: true }}
        panOnScroll
        zoomOnDoubleClick={false}
        minZoom={0.3}
        maxZoom={1.5}
      />
      {edgeToDelete && (
        <ConfirmDialog
          title="Remove blocking link?"
          message="Remove the 'blocks' relationship between these issues?"
          confirmLabel="Remove"
          onConfirm={confirmDeleteEdge}
          onCancel={() => setEdgeToDelete(null)}
        />
      )}
    </>
  );
}
