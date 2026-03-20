import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type EdgeMouseHandler,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { AlertCircle, ExternalLink, Maximize2 } from "lucide-react";
import {
  useLinearProjectIssues,
  useLinearIssuesByBranches,
  useLinearMyActiveIdentifiers,
  useLinearOtherIssues,
  useLinearMyProjects,
} from "../../hooks/useLinear";
import { useCurrentLinearTeamIds } from "../../hooks/useLinearConfig";
import { useTmuxSessions, useClaudeSessionStates } from "../../hooks/useTmux";
import { useCmuxNotifications } from "../../hooks/useCmuxNotifications";
import { useCmuxSidebarSync } from "../../hooks/useCmuxSidebarSync";
import { useCmuxProgressSync } from "../../hooks/useCmuxProgressSync";
import { useTerminalStatuses } from "../../hooks/useTerminalStatuses";
import { useGitHubMyOpenPRs, useGitHubRepoAccess } from "../../hooks/useGitHub";
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
  OTHER_ISSUES_PROJECT_ID,
} from "../../stores/projectStore";
import { UnifiedTaskCard, type UnifiedTaskNodeData } from "./UnifiedTaskCard";
import { OrphanTaskCard, type OrphanTaskNodeData } from "./OrphanTaskCard";
import { GroupLabelNode, type GroupLabelNodeType } from "./GroupLabelNode";
import { DragConnectionLine } from "./DragConnectionLine";
import {
  calculatePositions,
  calculateGroupedPositions,
  calculateEdges,
  CARD_WIDTH,
  CARD_HEIGHT,
  H_GAP,
  V_GAP,
} from "../../lib/graphLayout";
import { toSessionName } from "../../lib/tmux-utils";
import type {
  EnrichedTask,
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
  groupLabel: GroupLabelNode,
};

const EDGE_COLOR = { dark: "#737373", light: "#8a8a84" } as const;
const EDGE_HIGHLIGHT_COLOR = "#ef4444";
const NullConnectionLine = () => null;

export function DependencyGraph() {
  return (
    <ReactFlowProvider>
      <DependencyGraphInner />
    </ReactFlowProvider>
  );
}

function DependencyGraphInner() {
  const teamIds = useCurrentLinearTeamIds();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const repos = useWorkspaceRepos();

  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const projects = useProjectStore((s) => s.projects);
  const selectedProjectUrl = useMemo(
    () => projects.find((p) => p.id === selectedProjectId)?.url ?? null,
    [projects, selectedProjectId],
  );

  const { data: linearProjects } = useLinearMyProjects();
  const memberProjectIds = useMemo(
    () => linearProjects?.map((p) => p.id),
    [linearProjects],
  );

  const { data: projectTasks } = useLinearProjectIssues(
    selectedProjectId,
    teamIds,
  );
  const { data: otherTasks } = useLinearOtherIssues(memberProjectIds);
  const tasks =
    selectedProjectId === OTHER_ISSUES_PROJECT_ID ? otherTasks : projectTasks;
  const { data: sessions } = useTmuxSessions();
  const activeSessionNames = useMemo(
    () => (sessions ?? []).map((s) => s.name),
    [sessions],
  );
  const { data: claudeStates } = useClaudeSessionStates(activeSessionNames);
  const cmuxNotifications = useCmuxNotifications();
  const {
    data: prs,
    isError: isPRsError,
    error: prsError,
  } = useGitHubMyOpenPRs();
  const { data: blockedRepos } = useGitHubRepoAccess(repos);
  const { data: allWorktrees } = useAllWorktrees(repos);
  const { data: myActiveIdentifiers } = useLinearMyActiveIdentifiers();
  const { statusMap: terminalStatusMap } = useTerminalStatuses();

  const repoNwoById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of repos) {
      if (r.githubNwo) map.set(r.id, r.githubNwo);
    }
    return map;
  }, [repos]);

  const createBlockedBy = useCreateBlockedBy();
  const deleteBlockedBy = useDeleteBlockedBy();

  const [deleteMenu, setDeleteMenu] = useState<{
    x: number;
    y: number;
    edges: EdgeWithRelation[];
  } | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const { screenToFlowPosition, getIntersectingNodes, fitView } =
    useReactFlow();

  // Auto-fitView when switching projects
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.1, duration: 300 });
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedProjectId, fitView]);

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

  // Build enriched task list with resolved worktrees and PRs for cmux sidebar sync.
  // Each entry mirrors the data computed per-task in the node-building memo below.
  const tasksWithContext = useMemo(() => {
    const activeTasks = tasks ?? [];
    return activeTasks.map((task) => {
      const wtInfo = worktreeByBranch.get(task.identifier.toLowerCase());
      const pr =
        prByBranch.get(task.identifier.toLowerCase()) ??
        (wtInfo ? prByBranch.get(wtInfo.worktree.branch.toLowerCase()) : null);
      return {
        task,
        worktree: wtInfo?.worktree ?? null,
        pullRequest: pr ?? null,
      };
    });
  }, [tasks, worktreeByBranch, prByBranch]);

  // Push Linear/PR/CI status to the cmux sidebar whenever data changes.
  useCmuxSidebarSync(tasksWithContext);

  // Push workflow progress milestones and activity logs to the cmux sidebar.
  useCmuxProgressSync(tasksWithContext);

  // Find orphan worktrees (not linked to any active issue across all projects)
  const orphanWorktrees = useMemo(() => {
    const knownIdentifiers = myActiveIdentifiers ?? new Set<string>();

    const orphans: OrphanWorktree[] = [];
    for (const rw of allWorktrees ?? []) {
      // Skip main worktree (index 0)
      for (const wt of rw.worktrees.slice(1)) {
        if (!knownIdentifiers.has(wt.branch.toLowerCase())) {
          orphans.push({
            worktree: wt,
            repoId: rw.repoId,
            repoPath: rw.repoPath,
            session: sessionByName.get(toSessionName(wt.branch)) ?? null,
          });
        }
      }
    }
    return orphans;
  }, [myActiveIdentifiers, allWorktrees, sessionByName]);

  const orphanBranchNames = useMemo(
    () => orphanWorktrees.map((o) => o.worktree.branch),
    [orphanWorktrees],
  );
  const { data: linearIssuesByBranch } =
    useLinearIssuesByBranches(orphanBranchNames);

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
            pullRequest:
              prByBranch.get(orphan.worktree.branch.toLowerCase()) ?? null,
            linearIssue:
              linearIssuesByBranch?.get(orphan.worktree.branch.toLowerCase()) ??
              null,
          },
          draggable: false,
        }),
      );
      return { nextNodes: orphanNodes, nextEdges: [] };
    }

    const activeTasks = tasks ?? [];

    // Grouped layout for cross-project "Other issues" view
    if (selectedProjectId === OTHER_ISSUES_PROJECT_ID) {
      const { nodes: groupPositions, labels } =
        calculateGroupedPositions(activeTasks);
      const posById = new Map(groupPositions.map((p) => [p.id, p]));

      const labelNodes: GroupLabelNodeType[] = labels.map((lbl) => ({
        id: `group-label-${lbl.groupKey}`,
        type: "groupLabel",
        position: { x: lbl.x, y: lbl.y },
        data: { label: lbl.label },
        draggable: false,
        selectable: false,
      }));

      const taskNodes: Node<UnifiedTaskNodeData>[] = activeTasks.map((task) => {
        const pos = posById.get(task.id) ?? { x: 0, y: 0 };
        const wtInfo = worktreeByBranch.get(task.identifier.toLowerCase());
        const pr =
          prByBranch.get(task.identifier.toLowerCase()) ??
          (wtInfo
            ? prByBranch.get(wtInfo.worktree.branch.toLowerCase())
            : null);
        const sessionName = toSessionName(task.identifier);
        const repoNwo = wtInfo ? repoNwoById.get(wtInfo.repoId) : undefined;
        const githubRepoBlocked = !!(repoNwo && blockedRepos?.has(repoNwo));
        const hasSession = sessionByName.has(sessionName);
        const terminalActive = hasSession
          ? (terminalStatusMap.get(sessionName) ?? false)
          : null;
        return {
          id: task.id,
          type: "unifiedTask" as const,
          position: { x: pos.x, y: pos.y },
          data: {
            task,
            worktree: wtInfo?.worktree ?? null,
            worktreeRepoPath: wtInfo?.repoPath ?? null,
            session: sessionByName.get(sessionName) ?? null,
            pullRequest: pr ?? null,
            repos,
            claudeStatus: claudeStates?.get(sessionName) ?? null,
            cmuxNotification: cmuxNotifications.get(sessionName) ?? null,
            githubRepoBlocked,
            terminalActive,
          },
          draggable: false,
        };
      });

      return {
        nextNodes: [...labelNodes, ...taskNodes],
        nextEdges: [],
      };
    }

    // Calculate positions for dependency graph
    const positions = calculatePositions(activeTasks);
    const positionById = new Map(positions.map((p) => [p.id, p]));

    const taskNodes: Node<UnifiedTaskNodeData>[] = activeTasks.map((task) => {
      const pos = positionById.get(task.id) ?? { x: 0, y: 0 };
      const wtInfo = worktreeByBranch.get(task.identifier.toLowerCase());
      const pr =
        prByBranch.get(task.identifier.toLowerCase()) ??
        (wtInfo ? prByBranch.get(wtInfo.worktree.branch.toLowerCase()) : null);

      const sessionName = toSessionName(task.identifier);
      const repoNwo = wtInfo ? repoNwoById.get(wtInfo.repoId) : undefined;
      const githubRepoBlocked = !!(repoNwo && blockedRepos?.has(repoNwo));
      const hasSession = sessionByName.has(sessionName);
      const terminalActive = hasSession
        ? (terminalStatusMap.get(sessionName) ?? false)
        : null;
      return {
        id: task.id,
        type: "unifiedTask",
        position: { x: pos.x, y: pos.y },
        data: {
          task,
          worktree: wtInfo?.worktree ?? null,
          worktreeRepoPath: wtInfo?.repoPath ?? null,
          session: sessionByName.get(sessionName) ?? null,
          pullRequest: pr ?? null,
          repos,
          claudeStatus: claudeStates?.get(sessionName) ?? null,
          cmuxNotification: cmuxNotifications.get(sessionName) ?? null,
          githubRepoBlocked,
          terminalActive,
        },
        draggable: false,
      };
    });

    // Calculate edges for blocking relationships
    const edgeData = calculateEdges(activeTasks);
    // Build identifier lookup
    const identifierById = new Map(
      activeTasks.map((t) => [t.id, t.identifier]),
    );
    const edgeColor =
      resolvedTheme === "dark" ? EDGE_COLOR.dark : EDGE_COLOR.light;
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
      style: { stroke: edgeColor, strokeWidth: 1.5, cursor: "pointer" },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeColor,
        width: 12,
        height: 12,
      },
    }));

    return { nextNodes: taskNodes, nextEdges: taskEdges };
  }, [
    selectedProjectId,
    tasks,
    orphanWorktrees,
    worktreeByBranch,
    prByBranch,
    sessionByName,
    claudeStates,
    cmuxNotifications,
    repos,
    resolvedTheme,
    repoNwoById,
    blockedRepos,
    linearIssuesByBranch,
    terminalStatusMap,
  ]);

  // Apply hover highlight as derived data (no effect needed)
  const displayEdges = useMemo(() => {
    if (!hoveredEdgeId) return nextEdges;
    return nextEdges.map((edge) => {
      if (edge.id !== hoveredEdgeId) return edge;
      return {
        ...edge,
        style: {
          ...edge.style,
          stroke: EDGE_HIGHLIGHT_COLOR,
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: EDGE_HIGHLIGHT_COLOR,
          width: 14,
          height: 14,
        },
      };
    });
  }, [nextEdges, hoveredEdgeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Sync computed graph to ReactFlow state
  useEffect(() => {
    setNodes(nextNodes);
    setEdges(displayEdges);
  }, [nextNodes, displayEdges, setNodes, setEdges]);

  // Build task lookup for optimistic updates
  const taskById = useMemo(() => {
    const map = new Map<string, EnrichedTask>();
    for (const task of tasks ?? []) {
      map.set(task.id, task);
    }
    return map;
  }, [tasks]);

  // Refs to avoid re-registering drag listeners when these change mid-drag
  const dragStateRef = useRef<DragState | null>(null);
  const taskByIdRef = useRef(taskById);
  taskByIdRef.current = taskById;
  const createBlockedByRef = useRef(createBlockedBy);
  createBlockedByRef.current = createBlockedBy;

  // Handle edge click - show menu for all edges at click location
  const onEdgeClick: EdgeMouseHandler = useCallback(
    (event, edge) => {
      const clickedEdge = edge as EdgeWithRelation;

      // WARNING: relies on ReactFlow internal DOM structure — may break on major version upgrades
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
      // Disable drag in orphan and cross-project views
      if (
        selectedProjectId === ORPHAN_PROJECT_ID ||
        selectedProjectId === OTHER_ISSUES_PROJECT_ID
      )
        return;

      // Use the actual circle element's center as the source position
      const circleEl = e.currentTarget as HTMLElement;
      const rect = circleEl.getBoundingClientRect();
      const sourcePosition = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });

      const initial: DragState = {
        sourceNodeId: nodeId,
        sourcePosition,
        currentPosition: sourcePosition,
        targetNodeId: null,
      };
      dragStateRef.current = initial;
      setDragState(initial);
    },
    [screenToFlowPosition, selectedProjectId],
  );

  // Handle mouse move during drag — uses refs so listeners are registered once per drag
  const isDragging = dragState !== null;
  useEffect(() => {
    if (!isDragging) return;

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
        (n) =>
          n.id !== dragStateRef.current?.sourceNodeId &&
          n.type === "unifiedTask",
      );

      const newState: DragState = {
        ...dragStateRef.current!,
        currentPosition: flowPosition,
        targetNodeId: validTarget?.id ?? null,
      };
      dragStateRef.current = newState;
      setDragState(newState);
    };

    const handleMouseUp = () => {
      const ds = dragStateRef.current;
      if (ds?.targetNodeId) {
        const blockerTask = taskByIdRef.current.get(ds.sourceNodeId);
        const targetTask = taskByIdRef.current.get(ds.targetNodeId);
        if (blockerTask) {
          // Guard: duplicate relation
          if (targetTask?.blockedBy.some((b) => b.id === ds.sourceNodeId)) {
            toast.info("This blocking link already exists");
          }
          // Guard: direct cycle (A→B when B→A already exists)
          else if (
            blockerTask.blockedBy.some((b) => b.id === ds.targetNodeId)
          ) {
            toast.warning("This would create a circular dependency");
          } else {
            createBlockedByRef.current.mutate({
              blockerIssueId: ds.sourceNodeId,
              targetIssueId: ds.targetNodeId,
              blockerInfo: {
                id: blockerTask.id,
                identifier: blockerTask.identifier,
                title: blockerTask.title,
                url: blockerTask.url,
              },
            });
          }
        }
      }
      dragStateRef.current = null;
      setDragState(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dragStateRef.current = null;
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
  }, [isDragging, screenToFlowPosition, getIntersectingNodes]);

  // Build nodes with drag handlers — only create new data objects when values actually change
  const nodesWithDragHandlers = useMemo(() => {
    const targetId = dragState?.targetNodeId ?? null;
    return nodes.map((node) => {
      if (node.type !== "unifiedTask") return node;
      const isTarget = targetId === node.id;
      if (
        node.data.onDragStart === handleCardDragStart &&
        node.data.isBeingTargeted === isTarget
      ) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          onDragStart: handleCardDragStart,
          isBeingTargeted: isTarget,
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
        connectionLineComponent={NullConnectionLine}
        minZoom={0.3}
        maxZoom={1.5}
      >
        {selectedProjectUrl && (
          <div className="absolute top-3 right-3 z-10">
            <a
              href={selectedProjectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-[#5E6AD2]/30 bg-[#5E6AD2]/10 px-2.5 py-2 text-xs text-[#5E6AD2] shadow-sm transition-colors hover:bg-[#5E6AD2]/20"
              title="Open project in Linear"
            >
              <ExternalLink size={14} />
              <span>Linear</span>
            </a>
          </div>
        )}
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
          {isPRsError && (
            <div
              className="flex cursor-help items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-2.5 py-2 text-xs text-[var(--accent-red)] shadow-sm transition-colors hover:bg-[var(--bg-tertiary)]"
              title={
                prsError instanceof Error
                  ? `GitHub PR data unavailable: ${prsError.message}`
                  : "GitHub PR data unavailable — card statuses may be inaccurate"
              }
            >
              <AlertCircle size={14} />
              <span>GitHub error</span>
            </div>
          )}
          <button
            onClick={() => fitView({ padding: 0.1, duration: 300 })}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] p-2 text-[var(--text-muted)] shadow-sm transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            title="Fit all cards"
          >
            <Maximize2 size={16} />
          </button>
        </div>
        {dragState && (
          <DragConnectionLine
            fromX={dragState.sourcePosition.x}
            fromY={dragState.sourcePosition.y}
            toX={dragState.currentPosition.x}
            toY={dragState.currentPosition.y}
            hasValidTarget={dragState.targetNodeId !== null}
            color={
              resolvedTheme === "dark" ? EDGE_COLOR.dark : EDGE_COLOR.light
            }
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
