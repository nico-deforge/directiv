import { IssueRelationType } from "@linear/sdk";
import { toast } from "sonner";
import { linearClient } from "./linear";
import {
  worktreeCreate,
  worktreeList,
  tmuxCreateSession,
  tmuxKillSession,
  tmuxListSessions,
  tmuxSendKeys,
  tmuxWaitForReady,
  openTerminal,
  runHooks,
} from "./tauri";
import { toSessionName } from "./tmux-utils";

interface StartTaskParams {
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

  // 2. Reuse or create tmux session (with rollback on failure)
  const sessionName = toSessionName(identifier);
  const sessions = await tmuxListSessions();
  const existingSession = sessions.find((s) => s.name === sessionName);
  if (!existingSession) {
    await tmuxCreateSession(sessionName, worktree.path);
    try {
      await tmuxWaitForReady(sessionName);
      // 2.5 Run onStart hooks in the worktree directory
      if (onStart && onStart.length > 0) {
        await runHooks(onStart, worktree.path);
      }
      // 3. Launch Claude only on fresh sessions
      const claudeCmd = skill ? `claude "/${skill} ${identifier}"` : "claude";
      await tmuxSendKeys(sessionName, claudeCmd);
    } catch (err) {
      // Rollback: kill session so retry creates a fresh one
      await tmuxKillSession(sessionName).catch(() => {});
      throw err;
    }
  }

  // 4. Open terminal (fire-and-forget — failure shouldn't block the flow)
  openTerminal(terminal, sessionName).catch((err) => {
    toast.warning(
      `Failed to open terminal: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  // 5. Update Linear status (best-effort — everything critical is already done)
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

  // 2. Reuse or create tmux session (with rollback on failure)
  const sessionName = toSessionName(branchName);
  const sessions = await tmuxListSessions();
  const existingSession = sessions.find((s) => s.name === sessionName);
  if (!existingSession) {
    await tmuxCreateSession(sessionName, worktree.path);
    try {
      await tmuxWaitForReady(sessionName);
      if (onStart && onStart.length > 0) {
        await runHooks(onStart, worktree.path);
      }
      // 3. Launch Claude (plain, no /linear-issue)
      await tmuxSendKeys(sessionName, "claude");
    } catch (err) {
      // Rollback: kill session so retry creates a fresh one
      await tmuxKillSession(sessionName).catch(() => {});
      throw err;
    }
  }

  // 4. Open terminal (fire-and-forget — failure shouldn't block the flow)
  openTerminal(terminal, sessionName).catch((err) => {
    toast.warning(
      `Failed to open terminal: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
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
