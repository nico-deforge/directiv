import { IssueRelationType } from "@linear/sdk";
import { toast } from "sonner";
import { getValidLinearClient } from "./linearAuth";
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
  cmuxCloseWorkspace,
} from "./tauri";
import { toSessionName } from "./tmux-utils";
import type {
  ActionKey,
  ClaudeModel,
  ModelOverrides,
  SkillOverrides,
  TerminalLayout,
} from "../types";

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
  repoOverrides?: SkillOverrides,
  globalOverrides?: SkillOverrides,
): string {
  const field = SKILL_FIELD[key];
  return repoOverrides?.[field] ?? globalOverrides?.[field] ?? SKILLS[key];
}

export function resolveModel(
  key: SkillKey,
  repoOverrides?: ModelOverrides,
  globalOverrides?: ModelOverrides,
): ClaudeModel | undefined {
  const field = SKILL_FIELD[key];
  return repoOverrides?.[field] ?? globalOverrides?.[field];
}

export function isOverriddenSkill(
  key: SkillKey,
  repoOverrides?: SkillOverrides,
  globalOverrides?: SkillOverrides,
): boolean {
  const field = SKILL_FIELD[key];
  return !!(repoOverrides?.[field] ?? globalOverrides?.[field]);
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
  repoPath: string;
  terminal: string;
  terminalLayout?: TerminalLayout;
  copyPaths?: string[];
  onStart?: string[];
  baseBranch?: string;
  fetchBefore?: boolean;
  skill?: string;
  usePlugin?: boolean;
  model?: ClaudeModel;
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

// --- cmux session management (bypasses tmux) ---

// For cmux, there is no tmux session. The workspace is created and Claude is
// launched entirely within CmuxController.create(), which receives the Claude
// command via the `session` field of TerminalConfig. This function runs the
// onStart hooks (if any) then delegates to openTerminal, passing the Claude
// command as the `session` parameter so CmuxController.create() can use it.
async function ensureSessionCmux(
  identifier: string,
  worktreePath: string,
  claudeCmd: string,
  terminal: string,
  terminalLayout: TerminalLayout | undefined,
  onStart?: string[],
): Promise<void> {
  if (onStart && onStart.length > 0) {
    await runHooks(onStart, worktreePath);
  }
  // Pass claudeCmd as `session` — CmuxController.create() reads it from
  // TerminalConfig.session and sends it as the startup command.
  await openTerminal(
    terminal,
    claudeCmd,
    identifier,
    worktreePath,
    terminalLayout,
  );
}

export interface RemoveWorktreeFlowParams {
  repoPath: string;
  worktreePath: string;
  branch?: string;
  sessionName?: string;
  beforeRemove?: string[];
  deleteBranch?: boolean;
  skipHooks?: boolean;
  terminal?: string;
}

export async function removeWorktreeFlow({
  repoPath,
  worktreePath,
  branch,
  sessionName,
  beforeRemove,
  deleteBranch = true,
  skipHooks = false,
  terminal,
}: RemoveWorktreeFlowParams): Promise<void> {
  if (!skipHooks && beforeRemove && beforeRemove.length > 0) {
    try {
      await runHooks(beforeRemove, worktreePath);
    } catch (err) {
      throw parseHookError(err);
    }
  }
  if (terminal === "cmux") {
    // For cmux, close the workspace by identifier (workspace name = identifier).
    // sessionName is the tmux session name convention — for cmux the workspace
    // name matches the identifier, not the sessionName.
    const workspaceName = branch ?? sessionName;
    if (workspaceName) {
      await cmuxCloseWorkspace(workspaceName).catch(() => {});
    }
  } else if (sessionName) {
    await tmuxKillSession(sessionName).catch(() => {});
  }
  await worktreeRemove(repoPath, worktreePath, branch, deleteBranch);
}

export function openTerminalWithToast(
  terminal: string,
  sessionName: string,
  identifier: string,
  worktreePath: string,
  layout?: TerminalLayout,
): void {
  openTerminal(terminal, sessionName, identifier, worktreePath, layout).catch(
    (err) => {
      toast.warning(
        `Failed to open terminal: ${err instanceof Error ? err.message : String(err)}`,
      );
    },
  );
}

export async function startTask({
  issueId,
  identifier,
  repoPath,
  terminal,
  terminalLayout,
  copyPaths,
  onStart,
  baseBranch,
  fetchBefore,
  skill,
  usePlugin,
  model,
}: StartTaskParams): Promise<void> {
  const worktree = await ensureWorktree(
    repoPath,
    identifier,
    copyPaths,
    baseBranch,
    fetchBefore,
  );

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
      onStart,
    );
  } else {
    const sessionName = toSessionName(identifier);
    await ensureSession(sessionName, worktree.path, onStart, claudeCmd);
    openTerminalWithToast(
      terminal,
      sessionName,
      identifier,
      worktree.path,
      terminalLayout,
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
  copyPaths?: string[];
  onStart?: string[];
  baseBranch?: string;
  fetchBefore?: boolean;
}

export async function startFreeTask({
  branchName,
  repoPath,
  terminal,
  terminalLayout,
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

  if (terminal === "cmux") {
    const claudeCmd = await buildClaudeCommand();
    await ensureSessionCmux(
      branchName,
      worktree.path,
      claudeCmd,
      terminal,
      terminalLayout,
      onStart,
    );
  } else {
    const sessionName = toSessionName(branchName);
    await ensureSession(sessionName, worktree.path, onStart);
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

  const issue = await client.issue(issueId);
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
