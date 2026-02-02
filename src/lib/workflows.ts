import { linearClient } from "./linear";
import {
  worktreeCreate,
  worktreeList,
  worktreeRemove,
  tmuxCreateSession,
  tmuxKillSession,
  tmuxListSessions,
  tmuxSendKeys,
  openTerminal,
  runHooks,
} from "./tauri";

interface StartTaskParams {
  issueId: string;
  identifier: string;
  repoPath: string;
  terminal: string;
  copyPaths?: string[];
  onStart?: string[];
  baseBranch?: string;
  fetchBefore?: boolean;
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
}: StartTaskParams): Promise<void> {
  // 1. Reuse or create git worktree
  const worktrees = await worktreeList(repoPath);
  let worktree = worktrees.find((w) => w.branch === identifier);
  if (!worktree) {
    worktree = await worktreeCreate(
      repoPath,
      identifier,
      copyPaths,
      baseBranch,
      fetchBefore,
    );
  }

  // 2. Reuse or create tmux session
  const sessions = await tmuxListSessions();
  const existingSession = sessions.find((s) => s.name === identifier);
  if (!existingSession) {
    await tmuxCreateSession(identifier, worktree.path);
    // 2.5 Run onStart hooks in the worktree directory
    if (onStart && onStart.length > 0) {
      await runHooks(onStart, worktree.path);
    }
    // 3. Launch Claude only on fresh sessions
    await tmuxSendKeys(identifier, `claude "/linear-issue ${identifier}"`);
  }

  // 4. Open terminal attached to the tmux session
  await openTerminal(terminal, identifier);

  // 5. Update Linear status to "In Progress"
  await updateLinearStatusToStarted(issueId);
}

interface CheckBeforeStopResult {
  isDirty: boolean;
  worktreePath: string | null;
}

export async function checkBeforeStop({
  identifier,
  repoPaths,
}: {
  identifier: string;
  repoPaths: string[];
}): Promise<CheckBeforeStopResult> {
  for (const repoPath of repoPaths) {
    const worktrees = await worktreeList(repoPath);
    const match = worktrees.find((w) => w.branch === identifier);
    if (match) {
      return { isDirty: match.isDirty, worktreePath: match.path };
    }
  }
  return { isDirty: false, worktreePath: null };
}

interface StopTaskParams {
  identifier: string;
  repoPaths: string[];
}

export async function stopTask({
  identifier,
  repoPaths,
}: StopTaskParams): Promise<void> {
  // 1. Kill tmux session
  try {
    await tmuxKillSession(identifier);
  } catch {
    // Session may not exist
  }

  // 2. Remove worktree (try each repo, only one will have it)
  // Worktree path follows the convention: {repoParent}/{repoBasename}-{identifier}
  const errors: string[] = [];
  let removed = false;
  for (const repoPath of repoPaths) {
    const parts = repoPath.split("/");
    const repoBasename = parts[parts.length - 1];
    const repoParent = parts.slice(0, -1).join("/");
    const worktreePath = `${repoParent}/${repoBasename}-${identifier}`;
    try {
      await worktreeRemove(repoPath, worktreePath);
      removed = true;
      break;
    } catch (e) {
      errors.push(`${repoPath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!removed && errors.length > 0) {
    throw new Error(
      `Failed to remove worktree for ${identifier}:\n${errors.join("\n")}`,
    );
  }
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
  // 1. Reuse or create git worktree
  const worktrees = await worktreeList(repoPath);
  let worktree = worktrees.find((w) => w.branch === branchName);
  if (!worktree) {
    worktree = await worktreeCreate(
      repoPath,
      branchName,
      copyPaths,
      baseBranch,
      fetchBefore,
    );
  }

  // 2. Reuse or create tmux session
  const sessions = await tmuxListSessions();
  const existingSession = sessions.find((s) => s.name === branchName);
  if (!existingSession) {
    await tmuxCreateSession(branchName, worktree.path);
    if (onStart && onStart.length > 0) {
      await runHooks(onStart, worktree.path);
    }
    // 3. Launch Claude (plain, no /linear-issue)
    await tmuxSendKeys(branchName, "claude");
  }

  // 4. Open terminal attached to the tmux session
  await openTerminal(terminal, branchName);
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
