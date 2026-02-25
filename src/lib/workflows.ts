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
import type { SkillOverrides, TerminalMode } from "../types";
import { useTerminalStore } from "../stores/terminalStore";

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

export class HookFailedError extends Error {
  hookCmd: string;
  stderr: string;
  constructor(hookCmd: string, stderr: string) {
    super(`Hook \`${hookCmd}\` failed: ${stderr}`);
    this.name = "HookFailedError";
    this.hookCmd = hookCmd;
    this.stderr = stderr;
  }
}

function parseHookError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/^Hook `(.+?)` failed:\s*([\s\S]*)$/);
  if (match) {
    return new HookFailedError(match[1], match[2]);
  }
  return err instanceof Error ? err : new Error(msg);
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

export type SkillKey = keyof typeof SKILLS;

const SKILL_FIELD: Record<SkillKey, keyof SkillOverrides> = {
  CODE: "code",
  PLAN: "plan",
};

export function resolveSkill(
  key: SkillKey,
  repoOverrides?: SkillOverrides,
  globalOverrides?: SkillOverrides,
): string {
  const field = SKILL_FIELD[key];
  return repoOverrides?.[field] ?? globalOverrides?.[field] ?? SKILLS[key];
}

export function isOverriddenSkill(
  key: SkillKey,
  repoOverrides?: SkillOverrides,
  globalOverrides?: SkillOverrides,
): boolean {
  const field = SKILL_FIELD[key];
  return !!(repoOverrides?.[field] ?? globalOverrides?.[field]);
}

export async function buildClaudeCommand(
  skill?: string,
  identifier?: string,
  usePlugin = true,
): Promise<string> {
  const pluginDir = usePlugin ? await getPluginDir() : null;
  const escapedDir = pluginDir ? pluginDir.replace(/'/g, "'\\''") : null;
  const pluginFlag = escapedDir ? ` --plugin-dir '${escapedDir}'` : "";
  if (skill && identifier) {
    if (usePlugin && !pluginDir) {
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
  title: string;
  repoPath: string;
  terminal: string;
  terminalMode?: TerminalMode;
  copyPaths?: string[];
  onStart?: string[];
  baseBranch?: string;
  fetchBefore?: boolean;
  skill?: string;
  usePlugin?: boolean;
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
  skipHooks?: boolean;
}

export async function removeWorktreeFlow({
  repoPath,
  worktreePath,
  branch,
  sessionName,
  beforeRemove,
  deleteBranch = true,
  skipHooks = false,
}: RemoveWorktreeFlowParams): Promise<void> {
  if (!skipHooks && beforeRemove && beforeRemove.length > 0) {
    try {
      await runHooks(beforeRemove, worktreePath);
    } catch (err) {
      throw parseHookError(err);
    }
  }
  if (sessionName) {
    await tmuxKillSession(sessionName).catch(() => {});
  }
  await worktreeRemove(repoPath, worktreePath, branch, deleteBranch);
}

export function openTerminalWithToast(
  terminal: string,
  sessionName: string,
): void {
  openTerminal(terminal, sessionName)
    .then((alreadyOpen) => {
      if (alreadyOpen) {
        toast.success("Terminal already open");
      }
    })
    .catch((err) => {
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
  terminalMode,
  copyPaths,
  onStart,
  baseBranch,
  fetchBefore,
  skill,
  usePlugin,
}: StartTaskParams): Promise<void> {
  const worktree = await ensureWorktree(
    repoPath,
    identifier,
    copyPaths,
    baseBranch,
    fetchBefore,
  );

  const sessionName = toSessionName(identifier);
  const claudeCmd = await buildClaudeCommand(skill, identifier, usePlugin);
  await ensureSession(sessionName, worktree.path, onStart, claudeCmd);

  if (terminalMode === "external") {
    openTerminalWithToast(terminal, sessionName);
  } else {
    useTerminalStore
      .getState()
      .openTerminal({ sessionName, identifier, title });
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
  terminalMode?: TerminalMode;
  copyPaths?: string[];
  onStart?: string[];
  baseBranch?: string;
  fetchBefore?: boolean;
}

export async function startFreeTask({
  branchName,
  repoPath,
  terminal,
  terminalMode,
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

  if (terminalMode === "external") {
    openTerminalWithToast(terminal, sessionName);
  } else {
    useTerminalStore
      .getState()
      .openTerminal({ sessionName, identifier: branchName, title: branchName });
  }
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
