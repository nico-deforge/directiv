/**
 * cmuxSidebar — push task context into the cmux sidebar.
 *
 * All functions are best-effort: errors are logged but never thrown.
 * Each function is a no-op when cmux is not the active terminal backend.
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

// --- Status key constants ---

export const CMUX_STATUS_KEYS = {
  LINEAR: "linear",
  PR: "pr",
  CI: "ci",
} as const;

// --- Push helpers ---

/**
 * Push Linear issue status to the cmux sidebar pill for a given workspace.
 *
 * @param workspaceName  The workspace name (= issue identifier, e.g. "ACQ-145")
 * @param linearStatus   The Linear state name (e.g. "In Progress", "Done")
 */
export async function pushLinearStatus(
  workspaceName: string,
  linearStatus: string,
): Promise<void> {
  try {
    await cmuxSetStatus(workspaceName, CMUX_STATUS_KEYS.LINEAR, linearStatus);
  } catch (err) {
    console.warn("[cmuxSidebar] pushLinearStatus failed (ignored):", err);
  }
}

/**
 * Push PR status to the cmux sidebar pill for a given workspace.
 *
 * @param workspaceName  The workspace name (= issue identifier, e.g. "ACQ-145")
 * @param prStatus       The PR state label: "open" | "in review" | "approved" | "changes requested"
 */
export async function pushPrStatus(
  workspaceName: string,
  prStatus: string,
): Promise<void> {
  try {
    await cmuxSetStatus(workspaceName, CMUX_STATUS_KEYS.PR, prStatus);
  } catch (err) {
    console.warn("[cmuxSidebar] pushPrStatus failed (ignored):", err);
  }
}

/**
 * Push CI status to the cmux sidebar pill for a given workspace.
 *
 * @param workspaceName  The workspace name (= issue identifier, e.g. "ACQ-145")
 * @param ciStatus       The CI status value from PullRequestInfo.ciStatus
 */
export async function pushCiStatus(
  workspaceName: string,
  ciStatus: CIStatus,
): Promise<void> {
  if (!ciStatus) return;

  const label = ciStatusLabel(ciStatus);
  try {
    await cmuxSetStatus(workspaceName, CMUX_STATUS_KEYS.CI, label);
  } catch (err) {
    console.warn("[cmuxSidebar] pushCiStatus failed (ignored):", err);
  }
}

// --- Derived PR status label ---

/**
 * Derive a human-readable PR status string from PR metadata.
 * Used as the value for the "pr" sidebar pill.
 */
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

/**
 * Workflow progress fractions per step (0.0 → 1.0).
 * Each step reflects a milestone in the Directiv start/stop workflow.
 */
export const CMUX_PROGRESS = {
  WORKTREE_CREATED: 0.2,
  CLAUDE_LAUNCHED: 0.4,
  PR_OPENED: 0.6,
  IN_REVIEW: 0.8,
  MERGED: 1.0,
} as const;

/**
 * Push a progress value (0.0–1.0) to the cmux workspace progress bar.
 *
 * @param workspaceName  The workspace name (= issue identifier, e.g. "ACQ-145")
 * @param value          Progress fraction between 0.0 and 1.0
 */
export async function pushProgress(
  workspaceName: string,
  value: number,
): Promise<void> {
  try {
    await cmuxSetProgress(workspaceName, value);
  } catch (err) {
    console.warn("[cmuxSidebar] pushProgress failed (ignored):", err);
  }
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

/**
 * Append a log entry to the cmux workspace log panel.
 *
 * @param workspaceName  The workspace name (= issue identifier, e.g. "ACQ-145")
 * @param level          Log level: "info" | "success" | "warning" | "error"
 * @param message        Log message to display
 */
export async function pushLog(
  workspaceName: string,
  level: CmuxLogLevel,
  message: string,
): Promise<void> {
  try {
    await cmuxLog(workspaceName, level, message);
  } catch (err) {
    console.warn("[cmuxSidebar] pushLog failed (ignored):", err);
  }
}

// --- Clear helpers ---

/**
 * Clear the progress bar and log panel for a workspace.
 * Called when a task is stopped.
 *
 * @param workspaceName  The workspace name (= issue identifier, e.g. "ACQ-145")
 */
export async function clearSidebarProgress(
  workspaceName: string,
): Promise<void> {
  try {
    await cmuxClearProgress(workspaceName);
  } catch (err) {
    console.warn("[cmuxSidebar] clearProgress failed (ignored):", err);
  }
}

export async function clearSidebarLog(workspaceName: string): Promise<void> {
  try {
    await cmuxClearLog(workspaceName);
  } catch (err) {
    console.warn("[cmuxSidebar] clearLog failed (ignored):", err);
  }
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
