/**
 * useCmuxProgressSync — sync workflow progress and activity logs to the cmux sidebar.
 *
 * Watches PR and CI data across active tasks and pushes:
 * - Progress bar updates when workflow milestones are reached (PR opened, review, merged)
 * - Log entries for significant agent events (PR created, CI pass/fail)
 *
 * Milestones are derived from PR state transitions detected between polling intervals.
 * Uses useEffect to sync TanStack Query data → cmux (external system), which is the
 * accepted pattern per project conventions for syncing to external stores.
 *
 * Complements useCmuxSidebarSync (which handles status pills, not progress/logs).
 */

import { useEffect, useRef } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import {
  pushProgress,
  pushLog,
  CMUX_PROGRESS,
  CMUX_LOG_LEVELS,
} from "../lib/cmuxSidebar";
import type { EnrichedTask, PullRequestInfo, WorktreeInfo } from "../types";

interface TaskWithContext {
  task: EnrichedTask;
  worktree: WorktreeInfo | null;
  pullRequest: PullRequestInfo | null;
}

// Track which events have already been logged per workspace so we don't
// spam the log panel on every poll cycle.
interface EventState {
  prNumber: number | null;
  ciStatus: string | null;
  reviewDecision: string | null;
  prState: string | null;
}

function toEventKey(state: EventState): string {
  return `${state.prNumber ?? ""}|${state.ciStatus ?? ""}|${state.reviewDecision ?? ""}|${state.prState ?? ""}`;
}

/**
 * Determine progress fraction based on PR state.
 * Returns null if no progress change is needed for this state.
 */
function progressFromPr(pr: PullRequestInfo): number | null {
  if (pr.state === "merged") return CMUX_PROGRESS.MERGED;
  if (pr.reviewDecision === "APPROVED") return CMUX_PROGRESS.IN_REVIEW;
  if (pr.reviewDecision === "REVIEW_REQUIRED") return CMUX_PROGRESS.IN_REVIEW;
  if (pr.state === "open" && pr.number > 0) return CMUX_PROGRESS.PR_OPENED;
  return null;
}

/**
 * Push progress milestones and activity logs to the cmux sidebar when PR/CI state
 * changes for active tasks.
 *
 * @param tasksWithContext  Tasks enriched with their resolved worktree and PR.
 *                          Tasks without a worktree are skipped (no active workspace).
 */
export function useCmuxProgressSync(tasksWithContext: TaskWithContext[]): void {
  const terminal = useSettingsStore((s) => s.config.terminal);
  const isCmux = terminal === "cmux";

  // Track last event state per workspace to detect changes between polls.
  const lastEventState = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isCmux || tasksWithContext.length === 0) return;

    for (const { task, worktree, pullRequest: pr } of tasksWithContext) {
      // Only track tasks with an active worktree (= active cmux workspace).
      if (!worktree) continue;

      const workspaceName = task.identifier;

      const eventState: EventState = {
        prNumber: pr?.number ?? null,
        ciStatus: pr?.ciStatus ?? null,
        reviewDecision: pr?.reviewDecision ?? null,
        prState: pr?.state ?? null,
      };

      const eventKey = toEventKey(eventState);
      const lastKey = lastEventState.current.get(workspaceName);

      if (lastKey === eventKey) continue;

      const isFirstSeen = lastKey === undefined;
      lastEventState.current.set(workspaceName, eventKey);

      // Skip logging on the very first observation (just initializing state,
      // no actual change happened — avoid flooding logs on app start).
      if (isFirstSeen) continue;

      if (!pr) continue;

      // PR opened or newly detected
      if (
        eventState.prNumber !== null &&
        (lastKey === undefined ||
          !lastKey.startsWith(`${eventState.prNumber}|`))
      ) {
        void pushProgress(workspaceName, CMUX_PROGRESS.PR_OPENED);
        void pushLog(
          workspaceName,
          CMUX_LOG_LEVELS.SUCCESS,
          `PR #${pr.number} opened: ${pr.title}`,
        );
      }

      // Review decision changed
      if (
        eventState.reviewDecision !== null &&
        eventState.reviewDecision !== "REVIEW_REQUIRED"
      ) {
        const progress = progressFromPr(pr);
        if (progress !== null) {
          void pushProgress(workspaceName, progress);
        }

        if (eventState.reviewDecision === "APPROVED") {
          void pushLog(
            workspaceName,
            CMUX_LOG_LEVELS.SUCCESS,
            `PR #${pr.number} approved`,
          );
        } else if (eventState.reviewDecision === "CHANGES_REQUESTED") {
          void pushLog(
            workspaceName,
            CMUX_LOG_LEVELS.WARNING,
            `PR #${pr.number}: changes requested`,
          );
        }
      }

      // PR merged
      if (eventState.prState === "merged") {
        void pushProgress(workspaceName, CMUX_PROGRESS.MERGED);
        void pushLog(
          workspaceName,
          CMUX_LOG_LEVELS.SUCCESS,
          `PR #${pr.number} merged`,
        );
      }

      // CI status changed
      if (eventState.ciStatus !== null) {
        if (eventState.ciStatus === "SUCCESS") {
          void pushLog(
            workspaceName,
            CMUX_LOG_LEVELS.SUCCESS,
            `CI passing on PR #${pr.number}`,
          );
        } else if (
          eventState.ciStatus === "FAILURE" ||
          eventState.ciStatus === "ERROR"
        ) {
          void pushLog(
            workspaceName,
            CMUX_LOG_LEVELS.WARNING,
            `CI failing on PR #${pr.number}`,
          );
        }
      }
    }
  }, [isCmux, tasksWithContext]);
}
