// --- Linear Status Types ---

export const LINEAR_STATUS_TYPES = {
  TRIAGE: "triage",
  BACKLOG: "backlog",
  TODO: "unstarted",
  IN_PROGRESS: "started",
  DONE: "completed",
  CANCELED: "canceled",
} as const;

export type LinearStatusType =
  (typeof LINEAR_STATUS_TYPES)[keyof typeof LINEAR_STATUS_TYPES];

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
  linearStatusType: LinearStatusType | null;
  statusColor: string | null;
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
  isAssignedToMe: boolean;
  assigneeName: string | null;
}

// --- Claude Session ---

export type ClaudeSessionStatus = "active" | "waiting" | "unknown";

// --- Tmux ---

export interface TmuxSession {
  name: string;
  attached: boolean;
  windows: number;
  created: string;
}

// --- Git Worktrees ---

export const WT_CI_STATUSES = {
  PASSED: "passed",
  RUNNING: "running",
  FAILED: "failed",
  CONFLICTS: "conflicts",
  NO_CI: "no-ci",
  ERROR: "error",
} as const;

export type WtCiStatus = (typeof WT_CI_STATUSES)[keyof typeof WT_CI_STATUSES];

export interface WorktreeInfo {
  branch: string;
  path: string;
  issueId: string | null;
  diffAdded: number;
  diffDeleted: number;
  ahead: number;
  behind: number;
  baseBranch: string | null;
  mainState: string | null;
  remoteAhead: number;
  ciStatus: WtCiStatus | null;
  ciUrl: string | null;
  ciStale: boolean | null;
  devUrl: string | null;
  devUrlActive: boolean | null;
}

// --- GitHub ---

export const CI_STATUSES = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
  PENDING: "PENDING",
  ERROR: "ERROR",
  EXPECTED: "EXPECTED",
} as const;

export type CIStatus = (typeof CI_STATUSES)[keyof typeof CI_STATUSES] | null;

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
  ciStatus: CIStatus;
  ciUrl: string | null;
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

export interface PluginSkillInfo {
  name: string;
  description: string | null;
  files: string[];
}

export interface ClaudeSkillEntry {
  id: string;
  name: string;
  description: string | null;
  source: "user" | "plugin" | "directiv";
  pluginName: string | null;
}

// --- Terminal Status ---

export interface TerminalStatus {
  sessionName: string;
  identifier: string;
  active: boolean;
}

// --- Config ---

export const TERMINAL_LAYOUTS = {
  FOCUS: "focus",
  SIDE_BY_SIDE: "side-by-side",
} as const;

export type TerminalLayout =
  (typeof TERMINAL_LAYOUTS)[keyof typeof TERMINAL_LAYOUTS];

export const TERMINAL_EMULATORS = {
  GHOSTTY: "ghostty",
  ITERM2: "iterm2",
  CMUX: "cmux",
} as const;

export type TerminalEmulator =
  (typeof TERMINAL_EMULATORS)[keyof typeof TERMINAL_EMULATORS];
export type CodeEditor = "zed" | "cursor" | "vscode" | "code";
export type Theme = "light" | "dark" | "system";

export interface WorkspaceConfig {
  id: string;
  name?: string;
  path: string;
}

export const ACTION_KEYS = ["code", "plan", "fixCi"] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

export type SkillOverrides = Partial<Record<ActionKey, string>>;

export const CLAUDE_MODELS = {
  OPUS: "opus",
  SONNET: "sonnet",
  HAIKU: "haiku",
} as const;

export type ClaudeModel = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS];

export type ModelOverrides = Partial<Record<ActionKey, ClaudeModel>>;

export interface DiscoveredRepo {
  id: string;
  path: string;
  workspaceId: string;
  githubNwo?: string;
}

// --- Cmux types ---

export const NOTIFICATION_CATEGORIES = {
  PERMISSION: "permission",
  QUESTION: "question",
  ERROR: "error",
  COMPLETED: "completed",
  WAITING: "waiting",
  ATTENTION: "attention",
} as const;

export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

export interface CmuxNotification {
  title: string;
  body: string | null;
  workspaceName: string;
  category: NotificationCategory;
}

// --- Task with context (used by cmux sync hooks) ---

export interface TaskWithContext {
  task: EnrichedTask;
  worktree: WorktreeInfo | null;
  pullRequest: PullRequestInfo | null;
}

export interface LinearOrgConfig {
  name: string;
  teamIds: string[];
}

export interface DirectivConfig {
  terminal: TerminalEmulator;
  terminalLayout: TerminalLayout;
  editor: CodeEditor;
  workspaces: WorkspaceConfig[];
  linear: Record<string, LinearOrgConfig>;
  theme: Theme;
  skills?: SkillOverrides;
  models?: ModelOverrides;
  onboardingCompleted?: boolean;
}
