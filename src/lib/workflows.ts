import { IssueRelationType } from "@linear/sdk";
import { toast } from "sonner";
import { linearClient } from "./linear";
import {
  worktreeCreate,
  worktreeList,
  worktreeRemove,
  tmuxCreateSession,
  tmuxKillSession,
  tmuxListSessions,
  tmuxSendKeys,
  tmuxWaitForReady,
  openTerminal,
  runHooks,
  getPluginDir,
} from "./tauri";
import { toSessionName } from "./tmux-utils";

// --- Typed errors for worktree creation ---

export class BranchExistsError extends Error {
  branchName: string;
  baseBranch: string | undefined;
  repoPath: string;
  constructor(
    branchName: string,
    baseBranch: string | undefined,
    repoPath: string,
  ) {
    super(`Branch '${branchName}' already exists`);
    this.name = "BranchExistsError";
    this.branchName = branchName;
    this.baseBranch = baseBranch;
    this.repoPath = repoPath;
  }
}

export class BaseNotFoundError extends Error {
  baseName: string;
  constructor(baseName: string) {
    super(`Base branch '${baseName}' not found`);
    this.name = "BaseNotFoundError";
    this.baseName = baseName;
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

export class BranchHasUnpushedError extends Error {
  branchName: string;
  constructor(branchName: string) {
    super(`Branch '${branchName}' has unpushed commits`);
    this.name = "BranchHasUnpushedError";
    this.branchName = branchName;
  }
}

function parseWorktreeError(
  err: unknown,
  baseBranch: string | undefined,
  repoPath: string,
): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("BRANCH_EXISTS:")) {
    const branch = msg.split("BRANCH_EXISTS:")[1];
    return new BranchExistsError(branch, baseBranch, repoPath);
  }
  if (msg.includes("BASE_NOT_FOUND:")) {
    const base = msg.split("BASE_NOT_FOUND:")[1];
    return new BaseNotFoundError(base);
  }
  if (msg.includes("BRANCH_HAS_UNPUSHED:")) {
    const branch = msg.split("BRANCH_HAS_UNPUSHED:")[1];
    return new BranchHasUnpushedError(branch);
  }
  return err instanceof Error ? err : new Error(msg);
}

export const SKILLS = {
  CODE: "directiv:linear-issue",
  PLAN: "directiv:linear-tactic",
} as const;

export type Skill = (typeof SKILLS)[keyof typeof SKILLS];

export async function buildClaudeCommand(
  skill?: string,
  identifier?: string,
): Promise<string> {
  const pluginDir = await getPluginDir();
  const escapedDir = pluginDir ? pluginDir.replace(/'/g, "'\\''") : null;
  const pluginFlag = escapedDir ? ` --plugin-dir '${escapedDir}'` : "";
  if (skill && identifier) {
    if (!pluginDir) {
      console.warn(
        "Plugin directory not found — launching Claude without skill",
      );
      return `claude${pluginFlag}`;
    }
    // Single-quote prevents all shell interpretation ($, backtick, \, !)
    const safeArg = `/${skill} ${identifier}`.replace(/'/g, "'\\''");
    return `claude '${safeArg}'${pluginFlag}`;
  }
  return `claude${pluginFlag}`;
}

export interface StartTaskParams {
  issueId: string;
  identifier: string;
  repoPath: string;
  terminal: string;
  copyPaths?: string[];
  onStart?: string[];
  baseBranch?: string;
  fetchBefore?: boolean;
  skill?: string;
}

async function ensureWorktree(
  repoPath: string,
  branchName: string,
  copyPaths?: string[],
  baseBranch?: string,
  fetchBefore?: boolean,
): Promise<{ path: string }> {
  const worktrees = await worktreeList(repoPath);
  const existingIndex = worktrees.findIndex((w) => w.branch === branchName);
  if (existingIndex > 0) return worktrees[existingIndex];
  if (existingIndex === 0) {
    throw new BranchCheckedOutError(branchName, worktrees[0].path);
  }
  try {
    return await worktreeCreate(
      repoPath,
      branchName,
      copyPaths,
      baseBranch,
      fetchBefore,
    );
  } catch (err) {
    throw parseWorktreeError(err, baseBranch, repoPath);
  }
}

async function ensureSession(
  sessionName: string,
  worktreePath: string,
  onStart?: string[],
  claudeCmd?: string,
): Promise<void> {
  const sessions = await tmuxListSessions();
  if (sessions.find((s) => s.name === sessionName)) return;

  if (onStart && onStart.length > 0) {
    await runHooks(onStart, worktreePath);
  }
  await tmuxCreateSession(sessionName, worktreePath);
  try {
    await tmuxWaitForReady(sessionName);
    const cmd = claudeCmd ?? (await buildClaudeCommand());
    await tmuxSendKeys(sessionName, cmd);
  } catch (err) {
    await tmuxKillSession(sessionName).catch(() => {});
    throw err;
  }
}

export interface RemoveWorktreeFlowParams {
  repoPath: string;
  worktreePath: string;
  branch?: string;
  sessionName?: string;
  beforeRemove?: string[];
  deleteBranch?: boolean;
}

export async function removeWorktreeFlow({
  repoPath,
  worktreePath,
  branch,
  sessionName,
  beforeRemove,
  deleteBranch = true,
}: RemoveWorktreeFlowParams): Promise<void> {
  if (beforeRemove && beforeRemove.length > 0) {
    await runHooks(beforeRemove, worktreePath);
  }
  if (sessionName) {
    await tmuxKillSession(sessionName).catch(() => {});
  }
  await worktreeRemove(repoPath, worktreePath, branch, deleteBranch);
}

export async function openTerminalNotify(
  terminal: string,
  sessionName: string,
): Promise<void> {
  const alreadyOpen = await openTerminal(terminal, sessionName);
  if (alreadyOpen) {
    toast.success("Terminal already open");
  }
}

function openTerminalBestEffort(terminal: string, sessionName: string): void {
  openTerminalNotify(terminal, sessionName).catch((err) => {
    toast.warning(
      `Failed to open terminal: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}

export async function startTask({
  issueId,
  identifier,
  repoPath,
  terminal,
  copyPaths,
  onStart,
  baseBranch,
  fetchBefore,
  skill,
}: StartTaskParams): Promise<void> {
  const worktree = await ensureWorktree(
    repoPath,
    identifier,
    copyPaths,
    baseBranch,
    fetchBefore,
  );

  const sessionName = toSessionName(identifier);
  const claudeCmd = await buildClaudeCommand(skill, identifier);
  await ensureSession(sessionName, worktree.path, onStart, claudeCmd);

  openTerminalBestEffort(terminal, sessionName);

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
  copyPaths?: string[];
  onStart?: string[];
  baseBranch?: string;
  fetchBefore?: boolean;
}

export async function startFreeTask({
  branchName,
  repoPath,
  terminal,
  copyPaths,
  onStart,
  baseBranch,
  fetchBefore,
}: StartFreeTaskParams): Promise<void> {
  const worktree = await ensureWorktree(
    repoPath,
    branchName,
    copyPaths,
    baseBranch,
    fetchBefore,
  );

  const sessionName = toSessionName(branchName);
  await ensureSession(sessionName, worktree.path, onStart);

  openTerminalBestEffort(terminal, sessionName);
}

async function updateLinearStatusToStarted(issueId: string): Promise<void> {
  if (!linearClient) {
    throw new Error("Linear client not initialized");
  }

  const issue = await linearClient.issue(issueId);
  const team = await issue.team;
  if (!team) {
    throw new Error("Issue has no team");
  }

  const states = await team.states();
  const startedState = states.nodes.find(
    (s) => s.type === "started" && s.name === "In Progress",
  );
  if (!startedState) {
    throw new Error("No 'started' state found for this team");
  }

  await linearClient.updateIssue(issueId, { stateId: startedState.id });
}

export async function createBlockedByRelation(
  targetIssueId: string,
  blockerIssueId: string,
): Promise<void> {
  if (!linearClient) throw new Error("Linear client not initialized");
  await linearClient.createIssueRelation({
    issueId: blockerIssueId,
    relatedIssueId: targetIssueId,
    type: IssueRelationType.Blocks,
  });
}

export async function deleteBlockedByRelation(
  relationId: string,
): Promise<void> {
  if (!linearClient) throw new Error("Linear client not initialized");
  await linearClient.deleteIssueRelation(relationId);
}
