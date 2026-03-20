/**
 * useCmuxSidebarSync — sync Linear/PR/CI state to the cmux sidebar.
 *
 * Watches Linear tasks, their worktrees, and their PRs, then pushes status
 * pills to cmux for each task that has an active worktree (= active cmux
 * workspace). Only fires when cmux is the configured terminal backend.
 *
 * Uses useEffect to sync TanStack Query data → cmux (external system). This is
 * the accepted pattern per project conventions for syncing to external stores.
 */

import { useEffect, useRef } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import {
  pushLinearStatus,
  pushPrStatus,
  pushCiStatus,
  derivePrStatusLabel,
} from "../lib/cmuxSidebar";
import type { TaskWithContext } from "../types";

interface SyncKey {
  linearStatus: string;
  prStatus: string | null;
  ciStatus: string | null;
}

function toSyncKeyString(k: SyncKey): string {
  return `${k.linearStatus}|${k.prStatus ?? ""}|${k.ciStatus ?? ""}`;
}

/**
 * Push Linear, PR, and CI status pills to the cmux sidebar for all active tasks.
 *
 * @param tasksWithContext  Tasks enriched with their resolved worktree and PR.
 *                          Tasks without a worktree are skipped (no active workspace).
 *
 * Deduplicates pushes: only sends updates when the status combination changes,
 * using a per-workspace ref to track last-pushed state.
 */
export function useCmuxSidebarSync(tasksWithContext: TaskWithContext[]): void {
  const terminal = useSettingsStore((s) => s.config.terminal);
  const isCmux = terminal === "cmux";

  // Track last pushed state per workspace to avoid redundant cmux calls.
  const lastPushed = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isCmux || tasksWithContext.length === 0) return;

    for (const { task, worktree, pullRequest } of tasksWithContext) {
      // Only push for tasks with an active worktree (= active cmux workspace).
      if (!worktree) continue;

      const workspaceName = task.identifier;
      const syncKey: SyncKey = {
        linearStatus: task.status,
        prStatus: pullRequest
          ? derivePrStatusLabel(pullRequest.reviewDecision)
          : null,
        ciStatus: pullRequest?.ciStatus ?? null,
      };

      const keyStr = toSyncKeyString(syncKey);
      if (lastPushed.current.get(workspaceName) === keyStr) continue;
      lastPushed.current.set(workspaceName, keyStr);

      // Push each pill — fire-and-forget, errors handled inside push helpers.
      void pushLinearStatus(workspaceName, syncKey.linearStatus);

      if (syncKey.prStatus !== null) {
        void pushPrStatus(workspaceName, syncKey.prStatus);
      }

      if (pullRequest && syncKey.ciStatus !== null) {
        void pushCiStatus(workspaceName, pullRequest.ciStatus);
      }
    }
  }, [isCmux, tasksWithContext]);
}
