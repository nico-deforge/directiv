import { invoke } from "@tauri-apps/api/core";
import type { TmuxSession, WorktreeInfo } from "../types";

// --- Worktree commands ---

export function worktreeList(repoPath: string): Promise<WorktreeInfo[]> {
  return invoke<WorktreeInfo[]>("worktree_list", { repoPath });
}

export function worktreeCreate(
  repoPath: string,
  issueId: string,
  copyPaths?: string[],
  baseBranch?: string,
  fetchBefore?: boolean,
): Promise<WorktreeInfo> {
  return invoke<WorktreeInfo>("worktree_create", {
    repoPath,
    issueId,
    copyPaths,
    baseBranch,
    fetchBefore,
  });
}

export function worktreeRemove(
  repoPath: string,
  worktreePath: string,
  branch?: string,
  deleteBranch?: boolean,
): Promise<void> {
  return invoke<void>("worktree_remove", { repoPath, worktreePath, branch, deleteBranch });
}

export function worktreeCheckMerged(
  repoPath: string,
  branch: string,
  baseBranch?: string,
): Promise<boolean> {
  return invoke<boolean>("worktree_check_merged", { repoPath, branch, baseBranch });
}

// --- Tmux commands ---

export function tmuxListSessions(): Promise<TmuxSession[]> {
  return invoke<TmuxSession[]>("tmux_list_sessions");
}

export function tmuxCreateSession(
  name: string,
  workingDir?: string,
): Promise<TmuxSession> {
  return invoke<TmuxSession>("tmux_create_session", { name, workingDir });
}

export function tmuxKillSession(name: string): Promise<void> {
  return invoke<void>("tmux_kill_session", { name });
}

export function tmuxSendKeys(session: string, keys: string): Promise<void> {
  return invoke<void>("tmux_send_keys", { session, keys });
}

export function tmuxCapturePane(session: string): Promise<string> {
  return invoke<string>("tmux_capture_pane", { session });
}

// --- Hook commands ---

export function runHooks(commands: string[], workingDir: string): Promise<void> {
  return invoke<void>("run_hooks", { commands, workingDir });
}

// --- Terminal commands ---

export function openTerminal(emulator: string, session: string): Promise<void> {
  return invoke<void>("open_terminal", { emulator, session });
}
