import { invoke } from "@tauri-apps/api/core";
import type {
  TmuxSession,
  WorktreeInfo,
  BundledSkillInfo,
  DiscoveredRepo,
} from "../types";

// --- Workspace commands ---

interface RawDiscoveredRepo {
  id: string;
  path: string;
  copyPaths: string[];
  onStart: string[];
  fetchBefore: boolean;
  configWarning?: string;
}

export async function scanWorkspace(
  workspacePath: string,
  workspaceId: string,
): Promise<DiscoveredRepo[]> {
  const repos = await invoke<RawDiscoveredRepo[]>("scan_workspace", {
    workspacePath,
  });
  return repos.map((repo) => ({
    ...repo,
    workspaceId,
  }));
}

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
  return invoke<void>("worktree_remove", {
    repoPath,
    worktreePath,
    branch,
    deleteBranch,
  });
}

export function worktreeCheckMerged(
  repoPath: string,
  branch: string,
): Promise<boolean> {
  return invoke<boolean>("worktree_check_merged", {
    repoPath,
    branch,
  });
}

export function gitFetchPrune(repoPath: string): Promise<void> {
  return invoke<void>("git_fetch_prune", { repoPath });
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

export function tmuxWaitForReady(
  session: string,
  timeoutMs?: number,
): Promise<void> {
  return invoke<void>("tmux_wait_for_ready", { session, timeoutMs });
}

// --- Hook commands ---

export function runHooks(
  commands: string[],
  workingDir: string,
): Promise<void> {
  return invoke<void>("run_hooks", { commands, workingDir });
}

// --- Terminal commands ---

export function openTerminal(emulator: string, session: string): Promise<void> {
  return invoke<void>("open_terminal", { emulator, session });
}

// --- Editor commands ---

export function openEditor(editor: string, path: string): Promise<void> {
  return invoke<void>("open_editor", { editor, path });
}

// --- Skills commands ---

export function getPluginDir(): Promise<string | null> {
  return invoke<string | null>("get_plugin_dir");
}

export function listBundledSkills(): Promise<BundledSkillInfo[]> {
  return invoke<BundledSkillInfo[]>("list_bundled_skills");
}
