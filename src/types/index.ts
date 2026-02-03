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

// --- Config ---

export type TerminalEmulator = "ghostty" | "iterm2" | "terminal" | "alacritty";

export interface RepoConfig {
  id: string;
  path: string;
  copyPaths?: string[];
  onStart?: string[];
  baseBranch?: string;
  fetchBefore?: boolean;
}

export interface LinearConfig {
  teamIds: string[];
  activeProject: string | null;
}

export interface LinairConfig {
  terminal: TerminalEmulator;
  repos: RepoConfig[];
  linear: LinearConfig;
}
