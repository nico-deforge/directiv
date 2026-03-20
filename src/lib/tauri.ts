import { invoke } from "@tauri-apps/api/core";
import type {
  TmuxSession,
  WorktreeInfo,
  PluginSkillInfo,
  ClaudeSkillEntry,
  DiscoveredRepo,
  TerminalStatus,
} from "../types";

// --- Workspace commands ---

interface RawDiscoveredRepo {
  id: string;
  path: string;
  githubNwo?: string;
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

// --- wt (Worktrunk) commands ---

import type { WtCiStatus } from "../types";

interface WtWorktreeInfoRaw {
  branch: string;
  path: string;
  isDirty: boolean;
  ahead: number;
  behind: number;
  mainState: string | null;
  ciStatus: string | null;
  ciUrl: string | null;
  ciStale: boolean | null;
  devUrl: string | null;
  devUrlActive: boolean | null;
}

export async function wtMerge(
  repoPath: string,
  branchName: string,
): Promise<void> {
  return invoke<void>("wt_merge", { repoPath, branchName });
}

export async function wtSwitchCreate(
  repoPath: string,
  branchName: string,
): Promise<{ path: string }> {
  return invoke<{ path: string }>("wt_switch_create", { repoPath, branchName });
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
    ciStatus: entry.ciStatus as WtCiStatus | null,
    ciUrl: entry.ciUrl,
    ciStale: entry.ciStale,
    devUrl: entry.devUrl,
    devUrlActive: entry.devUrlActive,
  }));
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
