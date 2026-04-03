import { IssueRelationType } from "@linear/sdk";
import { toast } from "sonner";
import { getValidLinearClient } from "./linearAuth";
import { linearQuery } from "./linearGraphQL";
import { ISSUE_TEAM_ID, type IssueTeamIdData } from "./linearQueries";
import { teamStatesCache } from "../hooks/useLinear";
import {
  wtList,
  wtSwitchCreate,
  tmuxCreateSession,
  tmuxKillSession,
  tmuxListSessions,
  tmuxSendKeys,
  tmuxWaitForReady,
  openTerminal,
  getPluginDir,
  cmuxCloseWorkspace,
} from "./tauri";
import {
  pushProgress,
  pushLog,
  clearSidebarProgress,
  clearSidebarLog,
  CMUX_PROGRESS,
  CMUX_LOG_LEVELS,
} from "./cmuxSidebar";
import { wtRemove } from "./tauriWt";
import { toSessionName } from "./tmux-utils";
import type {
  ActionKey,
  CIStatus,
  ClaudeModel,
  ModelOverrides,
  PullRequestInfo,
  SkillOverrides,
  TerminalLayout,
  WorktreeInfo,
  WtCiStatus,
} from "../types";
import { CI_STATUSES, WT_CI_STATUSES } from "../types";

// --- CI status helpers ---

export function mapPrCiToWtCi(prStatus: CIStatus): WtCiStatus {
  if (!prStatus) return WT_CI_STATUSES.RUNNING;
  if (prStatus === CI_STATUSES.SUCCESS || prStatus === CI_STATUSES.EXPECTED)
    return WT_CI_STATUSES.PASSED;
  if (prStatus === CI_STATUSES.FAILURE || prStatus === CI_STATUSES.ERROR)
    return WT_CI_STATUSES.FAILED;
  return WT_CI_STATUSES.RUNNING;
}

export function isMergeEligible(
  worktree: WorktreeInfo,
  pullRequest: PullRequestInfo | null,
): boolean {
  if (worktree.dirty) return false;
  if (worktree.ciStatus === WT_CI_STATUSES.CONFLICTS) return false;
  if (!pullRequest) return true;
  if (
    pullRequest.ciStatus === CI_STATUSES.SUCCESS ||
    pullRequest.ciStatus === CI_STATUSES.EXPECTED
  )
    return true;
  return (
    worktree.ciStatus === WT_CI_STATUSES.PASSED ||
    worktree.ciStatus === WT_CI_STATUSES.NO_CI
  );
}

export function getMergeBlockReason(
  worktree: WorktreeInfo,
  pullRequest: PullRequestInfo | null,
): string | null {
  if (worktree.dirty) return "Uncommitted changes";
  if (worktree.ciStatus === WT_CI_STATUSES.CONFLICTS) return "Merge conflicts";
  if (!pullRequest) return null;
  if (
    pullRequest.ciStatus === CI_STATUSES.SUCCESS ||
    pullRequest.ciStatus === CI_STATUSES.EXPECTED
  )
    return null;
  if (
    worktree.ciStatus === WT_CI_STATUSES.PASSED ||
    worktree.ciStatus === WT_CI_STATUSES.NO_CI
  )
    return null;
  return "CI not passed";
}

// --- Typed errors for worktree creation ---

export class BranchExistsError extends Error {
  branchName: string;
  repoPath: string;
  constructor(branchName: string, repoPath: string) {
    super(`Branch '${branchName}' already exists`);
    this.name = "BranchExistsError";
    this.branchName = branchName;
    this.repoPath = repoPath;
  }
}

export class BranchCheckedOutError extends Error {
  branchName: string;
  worktreePath: string;
  constructor(branchName: string, worktreePath: string) {
    super(`Branch '${branchName}' is already checked out in ${worktreePath}`);
    this.name = "BranchCheckedOutError";
    this.branchName = branchName;
    this.worktreePath = worktreePath;
  }
}

function parseWorktreeError(err: unknown, repoPath: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  // wt switch --create emits "already exists" when the branch is present
  if (msg.includes("already exists")) {
    const match = msg.match(/branch['"` ]+([^\s'"` ]+)/i);
    const branch = match?.[1] ?? "";
    return new BranchExistsError(branch, repoPath);
  }
  // wt remove / switch: branch is already checked out in another worktree
  if (msg.includes("already checked out")) {
    const pathMatch = msg.match(/in (.+)$/);
    return new BranchCheckedOutError("", pathMatch?.[1]?.trim() ?? repoPath);
  }
  return err instanceof Error ? err : new Error(msg);
}

export const SKILLS = {
  CODE: "directiv:linear-code",
  PLAN: "directiv:linear-plan",
  FIX_CI: "directiv:fix-ci",
} as const;

export type SkillKey = keyof typeof SKILLS;

const SKILL_FIELD: Record<SkillKey, ActionKey> = {
  CODE: "code",
  PLAN: "plan",
  FIX_CI: "fixCi",
};

export function resolveSkill(
  key: SkillKey,
  globalOverrides?: SkillOverrides,
): string {
  const field = SKILL_FIELD[key];
  return globalOverrides?.[field] ?? SKILLS[key];
}

export function resolveModel(
  key: SkillKey,
  globalOverrides?: ModelOverrides,
): ClaudeModel | undefined {
  const field = SKILL_FIELD[key];
  return globalOverrides?.[field];
}

export function isOverriddenSkill(
  key: SkillKey,
  globalOverrides?: SkillOverrides,
): boolean {
  const field = SKILL_FIELD[key];
  return !!globalOverrides?.[field];
}

export async function sendSkillToSession(
  sessionName: string,
  skill: string,
  identifier: string,
): Promise<void> {
  const safeCmd = `/${skill} ${identifier}`;
  await tmuxSendKeys(sessionName, safeCmd);
}

export async function buildClaudeCommand(
  skill?: string,
  identifier?: string,
  usePlugin = true,
  model?: ClaudeModel,
): Promise<string> {
  const pluginDir = usePlugin ? await getPluginDir() : null;
  const escapedDir = pluginDir ? pluginDir.replace(/'/g, "'\\''") : null;
  const pluginFlag = escapedDir ? ` --plugin-dir '${escapedDir}'` : "";
  const modelFlag = model ? ` --model '${model}'` : "";
  if (skill && identifier) {
    if (usePlugin && !pluginDir) {
      console.warn(
        "Plugin directory not found — launching Claude without skill",
      );
      return `claude${pluginFlag}${modelFlag}`;
    }
    // Single-quote prevents all shell interpretation ($, backtick, \, !)
    const safeArg = `/${skill} ${identifier}`.replace(/'/g, "'\\''");
    return `claude '${safeArg}'${pluginFlag}${modelFlag}`;
  }
  return `claude${pluginFlag}${modelFlag}`;
}

export interface StartTaskParams {
  issueId: string;
  identifier: string;
  title?: string;
  repoPath: string;
  terminal: string;
  terminalLayout?: TerminalLayout;
  skill?: string;
  usePlugin?: boolean;
  model?: ClaudeModel;
}

async function ensureWorktree(
  repoPath: string,
  branchName: string,
): Promise<{ path: string }> {
  const worktrees = await wtList(repoPath);
  const existing = worktrees.find((w) => w.branch === branchName);
  if (existing) {
    if (worktrees.indexOf(existing) === 0) {
      throw new BranchCheckedOutError(branchName, existing.path);
    }
    return existing;
  }
  try {
    return await wtSwitchCreate(repoPath, branchName);
  } catch (err) {
    throw parseWorktreeError(err, repoPath);
  }
}

async function ensureSession(
  sessionName: string,
  worktreePath: string,
  claudeCmd?: string,
): Promise<void> {
  const sessions = await tmuxListSessions();
  if (sessions.find((s) => s.name === sessionName)) return;

  await tmuxCreateSession(sessionName, worktreePath);
  try {
    await tmuxWaitForReady(sessionName);
    const cmd = claudeCmd ?? (await buildClaudeCommand());
    await tmuxSendKeys(sessionName, cmd);
  } catch (err) {
    await tmuxKillSession(sessionName).catch((e) => {
      console.warn("[ensureSession] cleanup failed:", e);
    });
    throw err;
  }
}

// --- cmux session management (bypasses tmux) ---

// For cmux, there is no tmux session. The workspace is created and Claude is
// launched entirely within CmuxController.create(), which receives the Claude
// command via TerminalConfig.command. This function delegates to openTerminal,
// passing the Claude command as the `session` parameter — the Rust
// open_terminal handler maps it to TerminalConfig.command so
// CmuxController.create() can send it as the startup command.
async function ensureSessionCmux(
  identifier: string,
  worktreePath: string,
  claudeCmd: string,
  terminal: string,
  terminalLayout: TerminalLayout | undefined,
  title?: string,
): Promise<void> {
  await openTerminal(
    terminal,
    claudeCmd,
    identifier,
    worktreePath,
    terminalLayout,
    title,
  );
}

export interface RemoveWorktreeFlowParams {
  repoPath: string;
  branch: string;
  sessionName?: string;
  terminal?: string;
}

export async function removeWorktreeFlow({
  repoPath,
  branch,
  sessionName,
  terminal,
}: RemoveWorktreeFlowParams): Promise<void> {
  if (terminal === "cmux") {
    // For cmux, close the workspace by identifier (workspace name = identifier).
    // sessionName is the tmux session name convention — for cmux the workspace
    // name matches the identifier, not the sessionName.
    const workspaceName = branch ?? sessionName;
    if (workspaceName) {
      // Clear sidebar progress and logs before closing workspace.
      // Best-effort — errors are ignored inside clear helpers.
      void clearSidebarProgress(workspaceName);
      void clearSidebarLog(workspaceName);
      await cmuxCloseWorkspace(workspaceName).catch((e) => {
        console.warn("[removeWorktreeFlow] close workspace failed:", e);
      });
    }
  } else if (sessionName) {
    await tmuxKillSession(sessionName).catch((e) => {
      console.warn("[removeWorktreeFlow] kill session failed:", e);
    });
  }
  await wtRemove(repoPath, branch);
}

export function openTerminalWithToast(
  terminal: string,
  sessionName: string,
  identifier: string,
  worktreePath: string,
  layout?: TerminalLayout,
  title?: string,
): void {
  openTerminal(
    terminal,
    sessionName,
    identifier,
    worktreePath,
    layout,
    title,
  ).catch((err) => {
    toast.warning(
      `Failed to open terminal: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}

export async function startTask({
  issueId,
  identifier,
  title,
  repoPath,
  terminal,
  terminalLayout,
  skill,
  usePlugin,
  model,
}: StartTaskParams): Promise<void> {
  const worktree = await ensureWorktree(repoPath, identifier);

  // Step 1: worktree created — 20% progress
  if (terminal === "cmux") {
    void pushProgress(identifier, CMUX_PROGRESS.WORKTREE_CREATED);
    void pushLog(identifier, CMUX_LOG_LEVELS.INFO, "Worktree created");
  }

  const claudeCmd = await buildClaudeCommand(
    skill,
    identifier,
    usePlugin,
    model,
  );

  if (terminal === "cmux") {
    // cmux manages its own sessions — no tmux required.
    // CmuxController.create() creates the workspace and launches Claude.
    await ensureSessionCmux(
      identifier,
      worktree.path,
      claudeCmd,
      terminal,
      terminalLayout,
      title,
    );
    // Step 2: Claude launched — 40% progress
    void pushProgress(identifier, CMUX_PROGRESS.CLAUDE_LAUNCHED);
    void pushLog(identifier, CMUX_LOG_LEVELS.INFO, "Claude launched");
  } else {
    const sessionName = toSessionName(identifier);
    await ensureSession(sessionName, worktree.path, claudeCmd);
    openTerminalWithToast(
      terminal,
      sessionName,
      identifier,
      worktree.path,
      terminalLayout,
      title,
    );
  }

  await updateLinearStatusToStarted(issueId).catch((err) => {
    toast.warning(
      `Failed to update Linear status: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}

interface StartFreeTaskParams {
  branchName: string;
  repoPath: string;
  terminal: string;
  terminalLayout?: TerminalLayout;
}

export async function startFreeTask({
  branchName,
  repoPath,
  terminal,
  terminalLayout,
}: StartFreeTaskParams): Promise<void> {
  const worktree = await ensureWorktree(repoPath, branchName);

  if (terminal === "cmux") {
    const claudeCmd = await buildClaudeCommand();
    await ensureSessionCmux(
      branchName,
      worktree.path,
      claudeCmd,
      terminal,
      terminalLayout,
    );
  } else {
    const sessionName = toSessionName(branchName);
    await ensureSession(sessionName, worktree.path);
    openTerminalWithToast(
      terminal,
      sessionName,
      branchName,
      worktree.path,
      terminalLayout,
    );
  }
}

async function updateLinearStatusToStarted(issueId: string): Promise<void> {
  const client = await getValidLinearClient();
  if (!client) throw new Error("Linear not connected");

  // 1 minimal query to get team ID; states are usually cached (see fallback below)
  const data = await linearQuery<IssueTeamIdData>(ISSUE_TEAM_ID, {
    id: issueId,
  });
  const teamId = data.issue.team?.id;
  if (!teamId) throw new Error("Issue has no team");

  // Use cached team states (populated by useLinearViewerData)
  let states = teamStatesCache.get(teamId);
  if (!states) {
    // Fallback: fetch states directly (rare — only if cache is cold)
    const team = await client.team(teamId);
    const statesResult = await team.states();
    const mapped = statesResult.nodes.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      color: s.color,
    }));
    teamStatesCache.set(teamId, mapped);
    states = mapped;
  }

  const startedState = states.find(
    (s) => s.type === "started" && s.name === "In Progress",
  );
  if (!startedState) throw new Error("No 'started' state found for this team");

  await client.updateIssue(issueId, { stateId: startedState.id });
}

export async function createBlockedByRelation(
  targetIssueId: string,
  blockerIssueId: string,
): Promise<void> {
  const client = await getValidLinearClient();
  if (!client) throw new Error("Linear not connected");
  await client.createIssueRelation({
    issueId: blockerIssueId,
    relatedIssueId: targetIssueId,
    type: IssueRelationType.Blocks,
  });
}

export async function deleteBlockedByRelation(
  relationId: string,
): Promise<void> {
  const client = await getValidLinearClient();
  if (!client) throw new Error("Linear not connected");
  await client.deleteIssueRelation(relationId);
}
