import { invoke } from "@tauri-apps/api/core";
import type { TmuxSession, WorktreeInfo } from "../types";

// --- Worktree commands ---

export function worktreeList(): Promise<WorktreeInfo[]> {
  return invoke<WorktreeInfo[]>("worktree_list");
}

export function worktreeCreate(issueId: string): Promise<WorktreeInfo> {
  return invoke<WorktreeInfo>("worktree_create", { issueId });
}

export function worktreeRemove(branch: string): Promise<void> {
  return invoke<void>("worktree_remove", { branch });
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

// --- Terminal commands ---

export function openTerminal(emulator: string, session: string): Promise<void> {
  return invoke<void>("open_terminal", { emulator, session });
}
