// --- Workflow ---

export type WorkflowColumn =
  | "backlog"
  | "in-dev"
  | "personal-review"
  | "in-review"
  | "approved"
  | "done";

export type TaskAction =
  | "start"
  | "attach"
  | "logs"
  | "stop"
  | "open-terminal"
  | "open-pr"
  | "merge"
  | "archive";

export interface BlockingIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  relationId: string;
}

export interface EnrichedTask {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number;
  status: string;
  assigneeId: string | null;
  projectId: string | null;
  projectName: string | null;
  labels: string[];
  column: WorkflowColumn;
  session: TmuxSession | null;
  worktree: WorktreeInfo | null;
  pullRequest: PullRequestInfo | null;
  url: string;
  isBlocked: boolean;
  blockedBy: BlockingIssue[];
}

// --- Tmux ---

export interface TmuxSession {
  name: string;
  attached: boolean;
  windows: number;
  created: string;
}

// --- Git Worktrees ---

export interface WorktreeInfo {
  branch: string;
  path: string;
  issueId: string | null;
  isDirty: boolean;
  ahead: number;
  behind: number;
}

// --- GitHub ---

export interface PullRequestInfo {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  url: string;
  branch: string;
  draft: boolean;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  requestedReviewerCount: number;
  reviews: PullRequestReview[];
  createdAt: string;
  updatedAt: string;
}

export interface PullRequestReview {
  author: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING";
  submittedAt: string;
}

export interface ReviewRequestedPR {
  number: number;
  title: string;
  url: string;
  repoName: string;
  authorLogin: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
}

// --- Orphan Worktrees ---

export interface OrphanWorktree {
  worktree: WorktreeInfo;
  repoId: string;
  repoPath: string;
  session: TmuxSession | null;
}

// --- Cleanup ---

export interface StaleWorktree {
  worktree: WorktreeInfo;
  repoId: string;
  repoPath: string;
}

// --- Skills ---

export type SkillSource = { type: "global" } | { type: "repo"; repoId: string };

export interface SkillInfo {
  name: string;
  description: string | null;
  path: string;
  source: SkillSource;
  files: string[];
}

export interface SkillsResult {
  globalSkills: SkillInfo[];
  repoSkills: SkillInfo[];
}

// --- Config ---

export type TerminalEmulator = "ghostty" | "iterm2" | "terminal" | "alacritty";
export type CodeEditor = "zed" | "cursor" | "vscode" | "code";
export type Theme = "light" | "dark" | "system";

export interface WorkspaceConfig {
  id: string;
  name?: string;
  path: string;
}

export interface DiscoveredRepo {
  id: string;
  path: string;
  workspaceId: string;
  copyPaths: string[];
  onStart: string[];
  baseBranch?: string;
  fetchBefore: boolean;
}

export interface LinearConfig {
  teamIds: string[];
  activeProject: string | null;
}

export interface DirectivConfig {
  terminal: TerminalEmulator;
  editor: CodeEditor;
  workspaces: WorkspaceConfig[];
  linear: LinearConfig;
  theme: Theme;
}
