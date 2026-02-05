import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
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
import { DragConnectionLine } from "./DragConnectionLine";
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
  data?: {
    relationId: string;
    targetIssueId: string;
    sourceIdentifier: string;
    targetIdentifier: string;
  };
}

interface DragState {
  sourceNodeId: string;
  sourcePosition: { x: number; y: number };
  currentPosition: { x: number; y: number };
  targetNodeId: string | null;
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

export function DependencyGraph(props: DependencyGraphProps) {
  return (
    <ReactFlowProvider>
      <DependencyGraphInner {...props} />
    </ReactFlowProvider>
  );
}

function DependencyGraphInner({ onProjectsChange }: DependencyGraphProps) {
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

  const [deleteMenu, setDeleteMenu] = useState<{
    x: number;
    y: number;
    edges: EdgeWithRelation[];
  } | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const { screenToFlowPosition, getIntersectingNodes } = useReactFlow();

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
    // Build identifier lookup
    const identifierById = new Map(
      filteredTasks.map((t) => [t.id, t.identifier]),
    );
    // Use static amber color that matches our accent
    const edgeColor = resolvedTheme === "dark" ? "#f59e0b" : "#d97706";
    const taskEdges: EdgeWithRelation[] = edgeData.map((e) => ({
      id: e.relationId,
      source: e.source,
      target: e.target,
      data: {
        relationId: e.relationId,
        targetIssueId: e.target,
        sourceIdentifier: identifierById.get(e.source) ?? "?",
        targetIdentifier: identifierById.get(e.target) ?? "?",
      },
      type: "smoothstep",
      interactionWidth: 40, // Large clickable area
      style: { stroke: edgeColor, strokeWidth: 3, cursor: "pointer" },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeColor,
        width: 20,
        height: 20,
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
  }, [nextNodes, setNodes]);

  // Update edges with highlight for hovered edge
  useEffect(() => {
    const edgeColor = resolvedTheme === "dark" ? "#f59e0b" : "#d97706";
    const highlightColor = "#ef4444"; // red-500

    setEdges(
      nextEdges.map((edge) => ({
        ...edge,
        style: {
          ...edge.style,
          stroke: edge.id === hoveredEdgeId ? highlightColor : edgeColor,
          strokeWidth: edge.id === hoveredEdgeId ? 5 : 3,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edge.id === hoveredEdgeId ? highlightColor : edgeColor,
          width: 20,
          height: 20,
        },
        animated: edge.id === hoveredEdgeId,
      })),
    );
  }, [nextEdges, setEdges, hoveredEdgeId, resolvedTheme]);

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

  // Handle edge click - show menu for all edges at click location
  const onEdgeClick: EdgeMouseHandler = useCallback(
    (event, edge) => {
      const clickedEdge = edge as EdgeWithRelation;

      // Use document.elementsFromPoint to find all edge elements at click location
      const elementsAtPoint = document.elementsFromPoint(
        event.clientX,
        event.clientY,
      );

      // Find all edge IDs at this point
      const edgeIdsAtPoint = new Set<string>();
      for (const el of elementsAtPoint) {
        // ReactFlow edge interaction zones have this class
        if (el.classList.contains("react-flow__edge-interaction")) {
          const edgeGroup = el.closest(".react-flow__edge");
          if (edgeGroup) {
            const edgeId = edgeGroup.getAttribute("data-id");
            if (edgeId) {
              edgeIdsAtPoint.add(edgeId);
            }
          }
        }
      }

      // Always include the clicked edge as fallback
      edgeIdsAtPoint.add(clickedEdge.id);

      // Get full edge objects from the edges array
      const edgesAtPoint = edges.filter((e) =>
        edgeIdsAtPoint.has(e.id),
      ) as EdgeWithRelation[];

      setDeleteMenu({
        x: event.clientX,
        y: event.clientY,
        edges: edgesAtPoint.length > 0 ? edgesAtPoint : [clickedEdge],
      });
    },
    [edges],
  );

  const handleDeleteEdge = useCallback(
    (edge: EdgeWithRelation) => {
      if (!edge.data?.relationId || !edge.data?.targetIssueId) return;
      // Prevent deleting temporary edges (created optimistically, not yet synced)
      if (edge.data.relationId.startsWith("temp-")) {
        toast.error("Please wait for the link to sync before deleting");
        setDeleteMenu(null);
        return;
      }
      setDeleteMenu(null);
      setHoveredEdgeId(null);
      deleteBlockedBy.mutate({
        relationId: edge.data.relationId,
        targetIssueId: edge.data.targetIssueId,
      });
    },
    [deleteBlockedBy],
  );

  // Handle card drag start for creating dependencies
  const handleCardDragStart = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      // Disable drag in orphan view
      if (selectedProjectId === ORPHAN_PROJECT_ID) return;

      // Use the actual circle element's center as the source position
      const circleEl = e.currentTarget as HTMLElement;
      const rect = circleEl.getBoundingClientRect();
      const sourcePosition = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });

      setDragState({
        sourceNodeId: nodeId,
        sourcePosition,
        currentPosition: sourcePosition,
        targetNodeId: null,
      });
    },
    [screenToFlowPosition, selectedProjectId],
  );

  // Handle mouse move during drag
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const flowPosition = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      // Find intersecting nodes at cursor position
      const intersecting = getIntersectingNodes({
        x: flowPosition.x,
        y: flowPosition.y,
        width: 1,
        height: 1,
      });

      // Filter out source node and find valid target
      const validTarget = intersecting.find(
        (n) => n.id !== dragState.sourceNodeId && n.type === "unifiedTask",
      );

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              currentPosition: flowPosition,
              targetNodeId: validTarget?.id ?? null,
            }
          : null,
      );
    };

    const handleMouseUp = () => {
      if (dragState.targetNodeId) {
        const blockerTask = taskById.get(dragState.sourceNodeId);
        if (blockerTask) {
          createBlockedBy.mutate({
            blockerIssueId: dragState.sourceNodeId,
            targetIssueId: dragState.targetNodeId,
            blockerInfo: {
              id: blockerTask.id,
              identifier: blockerTask.identifier,
              title: blockerTask.title,
              url: blockerTask.url,
            },
          });
        }
      }
      setDragState(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDragState(null);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    dragState,
    screenToFlowPosition,
    getIntersectingNodes,
    taskById,
    createBlockedBy,
  ]);

  // Build nodes with drag handlers
  const nodesWithDragHandlers = useMemo(() => {
    return nodes.map((node) => {
      if (node.type !== "unifiedTask") return node;
      return {
        ...node,
        data: {
          ...node.data,
          onDragStart: handleCardDragStart,
          isBeingTargeted: dragState?.targetNodeId === node.id,
        },
      };
    });
  }, [nodes, handleCardDragStart, dragState?.targetNodeId]);

  return (
    <>
      <ReactFlow
        nodes={nodesWithDragHandlers}
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
        connectionLineComponent={() => null}
        minZoom={0.3}
        maxZoom={1.5}
      >
        {dragState && (
          <DragConnectionLine
            fromX={dragState.sourcePosition.x}
            fromY={dragState.sourcePosition.y}
            toX={dragState.currentPosition.x}
            toY={dragState.currentPosition.y}
            hasValidTarget={dragState.targetNodeId !== null}
          />
        )}
      </ReactFlow>
      {deleteMenu && (
        <>
          {/* Backdrop to close menu */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setDeleteMenu(null);
              setHoveredEdgeId(null);
            }}
          />
          {/* Dropdown menu */}
          <div
            className="fixed z-50 overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] shadow-xl"
            style={{ left: deleteMenu.x, top: deleteMenu.y }}
          >
            <div className="border-b border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium text-[var(--text-muted)]">
              {deleteMenu.edges.length > 1
                ? "Which link to remove?"
                : "Remove link"}
            </div>
            <div className="py-1">
              {deleteMenu.edges.map((edge) => (
                <button
                  key={edge.id}
                  onClick={() => handleDeleteEdge(edge)}
                  onMouseEnter={() => setHoveredEdgeId(edge.id)}
                  onMouseLeave={() => setHoveredEdgeId(null)}
                  className="group flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--accent-red)]/10"
                >
                  <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-xs font-medium text-[var(--text-primary)] group-hover:bg-[var(--accent-red)]/20 group-hover:text-[var(--accent-red)]">
                    {edge.data?.sourceIdentifier}
                  </span>
                  <span className="text-[var(--text-muted)]">→</span>
                  <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-xs font-medium text-[var(--text-primary)] group-hover:bg-[var(--accent-red)]/20 group-hover:text-[var(--accent-red)]">
                    {edge.data?.targetIdentifier}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
