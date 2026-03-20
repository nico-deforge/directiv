import { invoke } from "@tauri-apps/api/core";
import type {
  TmuxSession,
  WorktreeInfo,
  PluginSkillInfo,
  ClaudeSkillEntry,
  DiscoveredRepo,
  SkillOverrides,
  ModelOverrides,
  TerminalStatus,
} from "../types";

// --- Workspace commands ---

interface RawDiscoveredRepo {
  id: string;
  path: string;
  copyPaths: string[];
  onStart: string[];
  beforeRemove: string[];
  fetchBefore: boolean;
  configWarning?: string;
  skills?: SkillOverrides;
  models?: ModelOverrides;
  githubNwo?: string;
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

// --- wt (Worktrunk) commands ---

interface WtWorktreeInfoRaw {
  branch: string;
  path: string;
  isDirty: boolean;
  ahead: number;
  behind: number;
  mainState: string | null;
}

export async function wtList(repoPath: string): Promise<WorktreeInfo[]> {
  const raw = await invoke<WtWorktreeInfoRaw[]>("wt_list", { repoPath });
  return raw.map((entry) => ({
    branch: entry.branch,
    path: entry.path,
    // Derive issueId from branch name (same convention as Directiv)
    issueId: entry.branch.match(/^[A-Z]+-\d+(\.\d+)?$/i)
      ? entry.branch.toUpperCase()
      : null,
    isDirty: entry.isDirty,
    ahead: entry.ahead,
    behind: entry.behind,
    baseBranch: null,
    mainState: entry.mainState,
    remoteAhead: 0,
  }));
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

export function worktreeCreateExistingBranch(
  repoPath: string,
  issueId: string,
  copyPaths?: string[],
  baseBranch?: string,
  resetToBase?: boolean,
  forceReset?: boolean,
): Promise<WorktreeInfo> {
  return invoke<WorktreeInfo>("worktree_create_existing_branch", {
    repoPath,
    issueId,
    copyPaths,
    baseBranch,
    resetToBase: resetToBase ?? false,
    forceReset: forceReset ?? false,
  });
}

export function worktreeCheckBranchSynced(
  repoPath: string,
  branch: string,
): Promise<boolean> {
  return invoke<boolean>("worktree_check_branch_synced", {
    repoPath,
    branch,
  });
}

export function worktreeCheckMerged(
  repoPath: string,
  branch: string,
  baseBranch?: string,
): Promise<boolean> {
  return invoke<boolean>("worktree_check_merged", {
    repoPath,
    branch,
    baseBranch,
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

export function openTerminal(
  emulator: string,
  session: string,
  identifier: string,
  worktreePath: string,
  layout?: string,
): Promise<boolean> {
  return invoke<boolean>("open_terminal", {
    emulator,
    session,
    identifier,
    worktreePath,
    layout,
  });
}

export function queryTerminals(emulator: string): Promise<TerminalStatus[]> {
  return invoke<TerminalStatus[]>("query_terminals", { emulator });
}

export function cmuxCloseWorkspace(name: string): Promise<void> {
  return invoke<void>("cmux_close_workspace", { name });
}

// --- Editor commands ---

export function openEditor(editor: string, path: string): Promise<void> {
  return invoke<void>("open_editor", { editor, path });
}

// --- Skills commands ---

export function getPluginDir(): Promise<string | null> {
  return invoke<string | null>("get_plugin_dir");
}

export function listPluginSkills(): Promise<PluginSkillInfo[]> {
  return invoke<PluginSkillInfo[]>("list_plugin_skills");
}

export function readPluginSkillFile(
  skillName: string,
  filename: string,
): Promise<string> {
  return invoke<string>("read_plugin_skill_file", { skillName, filename });
}

export function listAllClaudeSkills(): Promise<ClaudeSkillEntry[]> {
  return invoke<ClaudeSkillEntry[]>("list_all_claude_skills");
}
