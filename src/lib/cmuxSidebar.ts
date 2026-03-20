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

import { cmuxSetStatus } from "./tauri";
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
