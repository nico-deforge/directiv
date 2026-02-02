// --- Workflow ---

export type WorkflowColumn =
  | "backlog"
  | "in-dev"
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
}

// --- GitHub ---

export interface PullRequestInfo {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  url: string;
  branch: string;
  draft: boolean;
  reviews: PullRequestReview[];
  createdAt: string;
  updatedAt: string;
}

export interface PullRequestReview {
  author: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING";
  submittedAt: string;
}

// --- Config ---

export type TerminalEmulator = "ghostty" | "iterm2" | "terminal" | "alacritty";

export interface RepoConfig {
  id: string;
  path: string;
  copyPaths?: string[];
  onStart?: string[];
}

export interface LinearConfig {
  teamIds: string[];
  activeProject: string | null;
}

export interface GitHubConfig {
  owner: string;
  repos: string[];
}

export interface LinairConfig {
  terminal: TerminalEmulator;
  repos: RepoConfig[];
  linear: LinearConfig;
  github: GitHubConfig;
}
