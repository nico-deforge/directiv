/**
 * cmuxSidebar — push task context into the cmux sidebar.
 *
 * All functions are best-effort: errors are logged but never thrown.
 * Called by hooks that gate on the cmux terminal backend.
 *
 * # Sidebar status keys
 * - "linear" — Linear issue status (e.g. "In Progress", "In Review")
 * - "pr"     — PR status (e.g. "open", "in review", "approved")
 * - "ci"     — CI status (e.g. "passing", "failing", "pending")
 *
 * # CLI syntax assumed
 * `cmux set-status --workspace <workspace_name> <key> <value>`
 * Workspace is targeted by name (= identifier / issue ID, e.g. "ACQ-145").
 */

import {
  cmuxSetStatus,
  cmuxSetProgress,
  cmuxLog,
  cmuxClearProgress,
  cmuxClearLog,
} from "./tauri";
import type { CIStatus } from "../types";

// --- Best-effort wrapper ---

async function bestEffort(
  label: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.warn(`[cmuxSidebar] ${label} failed:`, err);
  }
}

// --- Status key constants ---

export const CMUX_STATUS_KEYS = {
  LINEAR: "linear",
  PR: "pr",
  CI: "ci",
} as const;

// --- Push helpers ---

export async function pushLinearStatus(
  workspaceName: string,
  linearStatus: string,
): Promise<void> {
  await bestEffort("pushLinearStatus", () =>
    cmuxSetStatus(workspaceName, CMUX_STATUS_KEYS.LINEAR, linearStatus),
  );
}

export async function pushPrStatus(
  workspaceName: string,
  prStatus: string,
): Promise<void> {
  await bestEffort("pushPrStatus", () =>
    cmuxSetStatus(workspaceName, CMUX_STATUS_KEYS.PR, prStatus),
  );
}

export async function pushCiStatus(
  workspaceName: string,
  ciStatus: CIStatus,
): Promise<void> {
  if (!ciStatus) return;
  const label = ciStatusLabel(ciStatus);
  await bestEffort("pushCiStatus", () =>
    cmuxSetStatus(workspaceName, CMUX_STATUS_KEYS.CI, label),
  );
}

// --- Derived PR status label ---

export function derivePrStatusLabel(reviewDecision: string | null): string {
  switch (reviewDecision) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes requested";
    case "REVIEW_REQUIRED":
      return "in review";
    default:
      return "open";
  }
}

// --- Progress steps ---

export const CMUX_PROGRESS = {
  WORKTREE_CREATED: 0.2,
  CLAUDE_LAUNCHED: 0.4,
  PR_OPENED: 0.6,
  IN_REVIEW: 0.8,
  MERGED: 1.0,
} as const;

export async function pushProgress(
  workspaceName: string,
  value: number,
): Promise<void> {
  const clamped = Math.max(0, Math.min(1, value));
  await bestEffort("pushProgress", () =>
    cmuxSetProgress(workspaceName, clamped),
  );
}

// --- Log levels ---

export const CMUX_LOG_LEVELS = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
} as const;

export type CmuxLogLevel =
  (typeof CMUX_LOG_LEVELS)[keyof typeof CMUX_LOG_LEVELS];

export async function pushLog(
  workspaceName: string,
  level: CmuxLogLevel,
  message: string,
): Promise<void> {
  await bestEffort("pushLog", () => cmuxLog(workspaceName, level, message));
}

// --- Clear helpers ---

export async function clearSidebarProgress(
  workspaceName: string,
): Promise<void> {
  await bestEffort("clearProgress", () => cmuxClearProgress(workspaceName));
}

export async function clearSidebarLog(workspaceName: string): Promise<void> {
  await bestEffort("clearLog", () => cmuxClearLog(workspaceName));
}

// --- CI status label ---

function ciStatusLabel(ciStatus: CIStatus): string {
  switch (ciStatus) {
    case "SUCCESS":
      return "passing";
    case "FAILURE":
    case "ERROR":
      return "failing";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return String(ciStatus);
  }
}
