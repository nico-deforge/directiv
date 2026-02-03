import type { EnrichedTask } from "../types";

// Card dimensions and gaps
export const CARD_WIDTH = 380;
export const CARD_HEIGHT = 180;
export const H_GAP = 100;
export const V_GAP = 80;

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  depth: number;
}

/**
 * Calculate the depth of each task using topological sort.
 * - Tasks not blocked = depth 0
 * - Blocked tasks = max(depth of all blockers) + 1
 */
export function calculateDepths(tasks: EnrichedTask[]): Map<string, number> {
  const depths = new Map<string, number>();
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const taskByIdentifier = new Map(tasks.map((t) => [t.identifier, t]));

  // Initialize: tasks without blockers start at depth 0
  for (const task of tasks) {
    if (!task.isBlocked || task.blockedBy.length === 0) {
      depths.set(task.id, 0);
    }
  }

  // BFS to propagate depths
  let changed = true;
  let iterations = 0;
  const maxIterations = tasks.length + 1; // Safety limit

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const task of tasks) {
      if (depths.has(task.id)) continue;

      // Check if all blockers have depths calculated
      const blockerDepths: number[] = [];
      let allBlockersResolved = true;

      for (const blocker of task.blockedBy) {
        const blockerTask =
          taskById.get(blocker.id) ?? taskByIdentifier.get(blocker.identifier);
        if (blockerTask && depths.has(blockerTask.id)) {
          blockerDepths.push(depths.get(blockerTask.id)!);
        } else if (blockerTask) {
          // Blocker exists but depth not yet calculated
          allBlockersResolved = false;
        } else {
          // Blocker not in our task list (different team/project) - treat as depth 0
          blockerDepths.push(0);
        }
      }

      if (allBlockersResolved && blockerDepths.length > 0) {
        depths.set(task.id, Math.max(...blockerDepths) + 1);
        changed = true;
      } else if (allBlockersResolved) {
        // No blockers resolved to tasks in our list
        depths.set(task.id, 1);
        changed = true;
      }
    }
  }

  // Any remaining tasks without depth (circular deps or edge cases)
  for (const task of tasks) {
    if (!depths.has(task.id)) {
      depths.set(task.id, 0);
    }
  }

  return depths;
}

/**
 * Calculate node positions for the dependency graph.
 * Tasks are arranged by depth (y-axis) and try to align blocked tasks
 * under their blockers (same x column when possible).
 */
export function calculatePositions(tasks: EnrichedTask[]): NodePosition[] {
  const depths = calculateDepths(tasks);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const taskByIdentifier = new Map(tasks.map((t) => [t.identifier, t]));

  // Group tasks by depth
  const tasksByDepth = new Map<number, EnrichedTask[]>();
  for (const task of tasks) {
    const depth = depths.get(task.id) ?? 0;
    const group = tasksByDepth.get(depth) ?? [];
    group.push(task);
    tasksByDepth.set(depth, group);
  }

  const positions = new Map<string, NodePosition>();
  const usedPositionsAtDepth = new Map<number, Set<number>>(); // depth -> set of x indices

  // Get sorted depths (process from top to bottom)
  const sortedDepths = [...tasksByDepth.keys()].sort((a, b) => a - b);

  for (const depth of sortedDepths) {
    const levelTasks = tasksByDepth.get(depth) ?? [];
    const usedX = usedPositionsAtDepth.get(depth) ?? new Set<number>();
    usedPositionsAtDepth.set(depth, usedX);

    // Sort: prioritize tasks that have blockers already positioned
    levelTasks.sort((a, b) => {
      const aHasBlocker = a.blockedBy.some((bl) => {
        const blocker = taskById.get(bl.id) ?? taskByIdentifier.get(bl.identifier);
        return blocker && positions.has(blocker.id);
      });
      const bHasBlocker = b.blockedBy.some((bl) => {
        const blocker = taskById.get(bl.id) ?? taskByIdentifier.get(bl.identifier);
        return blocker && positions.has(blocker.id);
      });
      if (aHasBlocker && !bHasBlocker) return -1;
      if (!aHasBlocker && bHasBlocker) return 1;
      return a.priority - b.priority;
    });

    for (const task of levelTasks) {
      let targetX: number | null = null;

      // Try to align under a blocker
      for (const blocker of task.blockedBy) {
        const blockerTask =
          taskById.get(blocker.id) ?? taskByIdentifier.get(blocker.identifier);
        if (blockerTask) {
          const blockerPos = positions.get(blockerTask.id);
          if (blockerPos) {
            // Try to use the same x as the blocker
            const blockerXIndex = Math.round(blockerPos.x / (CARD_WIDTH + H_GAP));
            if (!usedX.has(blockerXIndex)) {
              targetX = blockerXIndex;
              break;
            }
            // Try adjacent positions
            for (let offset = 1; offset <= 3; offset++) {
              if (!usedX.has(blockerXIndex + offset)) {
                targetX = blockerXIndex + offset;
                break;
              }
              if (!usedX.has(blockerXIndex - offset) && blockerXIndex - offset >= 0) {
                targetX = blockerXIndex - offset;
                break;
              }
            }
            if (targetX !== null) break;
          }
        }
      }

      // If no blocker alignment possible, find first free slot
      if (targetX === null) {
        targetX = 0;
        while (usedX.has(targetX)) {
          targetX++;
        }
      }

      usedX.add(targetX);
      positions.set(task.id, {
        id: task.id,
        x: targetX * (CARD_WIDTH + H_GAP),
        y: depth * (CARD_HEIGHT + V_GAP),
        depth,
      });
    }
  }

  return [...positions.values()];
}

/**
 * Generate edges for blocking relationships.
 * Returns source -> target pairs where source blocks target.
 */
export function calculateEdges(
  tasks: EnrichedTask[],
): { source: string; target: string }[] {
  const taskByIdentifier = new Map(tasks.map((t) => [t.identifier, t]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const edges: { source: string; target: string }[] = [];

  for (const task of tasks) {
    for (const blocker of task.blockedBy) {
      const blockerTask =
        taskById.get(blocker.id) ?? taskByIdentifier.get(blocker.identifier);
      if (blockerTask) {
        edges.push({
          source: blockerTask.id,
          target: task.id,
        });
      }
    }
  }

  return edges;
}
