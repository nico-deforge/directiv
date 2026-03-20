# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

### Directiv — The Directed Acyclic Graph orchestrator for AI agents

Modern software teams don't just write code — they orchestrate complex workflows across multiple tools, contexts, and AI assistants. **Directiv** is the command center that brings order to this chaos.

By modeling your development pipeline as a DAG, Directiv ensures tasks flow through well-defined stages — from backlog to deployment — with AI agents executing each node autonomously while you maintain full visibility and control.

**Why Directiv?**
- **One board, complete visibility** — See every task's real status across Linear, GitHub, and active dev sessions
- **AI-native orchestration** — Launch Claude Code agents with full context in one click
- **Zero context-switching** — Manage worktrees, terminal sessions, and PR reviews without leaving the cockpit
- **Parallel execution** — Work on multiple tasks simultaneously with isolated git worktrees and tmux sessions

### Technical summary

Directiv is a Tauri 2.0 desktop app that integrates Linear, GitHub, tmux, and git worktrees into a unified pipeline board. Terminal display is delegated to external emulators (Ghostty or iTerm2) via a polymorphic `TerminalController` trait in Rust.

## Tech Stack

- **App framework:** Tauri 2.0 (Rust backend in `src-tauri/`, React frontend in `src/`)
- **Frontend:** React 19 + TypeScript, Zustand 5 (state), Tailwind CSS 4 (styling), TanStack Query 5 (data fetching), TanStack Router (routing), @xyflow/react (DAG visualization), lucide-react (icons)
- **Backend:** Rust with `tauri-plugin-shell` for system commands, `serde` for serialization, `keyring` for OS credential storage, `reqwest` for HTTP/OAuth
- **Terminal:** External only — Ghostty or iTerm2 via AppleScript, abstracted behind a `TerminalController` trait
- **Integrations:** `@linear/sdk`, `gh` CLI (GitHub), tmux CLI, git worktree
- **Dev tooling:** mise (tool version management + task runner)

## Build & Dev Commands

```bash
# Install
mise install               # Install tools (bun, rust) at pinned versions
mise run install           # Install frontend dependencies (bun install)

# Dev
mise run dev               # Run full Tauri app in dev mode
mise run dev:frontend      # Start Vite dev server (frontend only)

# Code quality
mise run check             # All checks in parallel (tsc + lint + format)
mise run tsc               # Type-check (no emit)
mise run lint              # ESLint
mise run format            # Prettier format

# Rust backend
mise run rust:build        # cargo build (in src-tauri/)
mise run rust:test         # cargo test (in src-tauri/)
mise run rust:clippy       # cargo clippy (in src-tauri/)
mise run rust:check        # All Rust checks (clippy + fmt)

# Build
mise run build             # Build production Tauri app
```

## Architecture

### Two-layer structure

- **`src/`** — React frontend: components, hooks, stores, lib, types
- **`src-tauri/`** — Rust backend: Tauri commands for worktree, tmux, and terminal operations

### Frontend patterns

- **Hooks** (`src/hooks/`) wrap SDK clients with TanStack Query for caching/polling: `useLinear`, `useGitHub`, `useTmux`, `useWorktrees`, `useTerminalStatuses`
- **Stores** (`src/stores/`) use Zustand: `workflowStore` (enriched tasks, filters), `settingsStore` (persisted user config), `projectStore` (selected project), `workspaceStore` (workspace config), `authStore` (OAuth state for Linear, gh CLI status for GitHub, cached Linear client factory)
- **Lib** (`src/lib/`) contains SDK clients, Tauri invoke wrappers (`tauriOAuth.ts` for Linear, `tauriGitHub.ts` for GitHub), and business logic (`workflows.ts` handles `startTask`, `removeWorktreeFlow`, etc.)

### Backend commands (`src-tauri/src/commands/`)

- `wt.rs` — Worktrunk CLI wrapper: `wt_version`, `wt_list`, `wt_switch_create`, `wt_remove`. All worktree operations delegate to the `wt` CLI binary.
- `tmux.rs` — session create/kill/list/send-keys/capture-pane/wait-for-ready
- `terminal/` — external terminal module:
  - `mod.rs` — `open_terminal`, `query_terminals`, `open_editor` commands
  - `controller.rs` — `TerminalController` trait (open, query, is_available)
  - `ghostty.rs` — Ghostty integration via AppleScript
  - `iterm.rs` — iTerm2 integration via AppleScript
  - `types.rs` — `TerminalConfig`, `TerminalRef`, `TerminalLayout`
- `config.rs` — `load_config` / `save_config` commands. Config lives at `~/Library/Application Support/directiv/config.json` (release) or `config.dev.json` (dev), using the same `#[cfg(debug_assertions)]` pattern as `shared.rs`. On first load, auto-migrates from legacy project-root `directiv.config.json` if found.
- `workspace.rs` — scan workspace directories, discover git repos. Returns `DiscoveredRepo { id, path, github_nwo }`.
- `skills.rs` — `get_plugin_dir`, `list_plugin_skills`, `read_plugin_skill_file`, `list_all_claude_skills`
- `github.rs` — GitHub integration via `gh` CLI: `gh_auth_status`, `gh_list_my_open_prs`, `gh_list_review_requests`, `gh_check_repo_access`
- `oauth/` — OAuth module directory (Linear only):
  - `shared.rs` — `keyring_get/set/delete` helpers with `#[cfg]` dual implementation: file-backed store (`dev-tokens.json`) in dev builds (no keychain prompts), OS keyring in release. Also exports `OAuthStatus` and `now_secs()`.
  - `linear.rs` — Linear OAuth2 Web Flow (PKCE + localhost callback)

### External terminal

Terminal display is fully delegated to external emulators. The `TerminalController` trait abstracts the integration:

- **Implementations:** `GhosttyController` and `ITermController`, both using AppleScript to open windows/tabs attached to tmux sessions
- **Commands:** `open_terminal` (spawns emulator attached to tmux session), `query_terminals` (polls emulator for open sessions), `open_editor` (opens code editor at worktree path)
- **Environment:** terminals receive `DIRECTIV_TASK`, `DIRECTIV_WORKTREE`, `DIRECTIV_SESSION` env vars
- **Hook:** `useTerminalStatuses()` polls external emulator session statuses via `query_terminals`

### Core workflow: "Start Task"

Triggered by clicking [Start] on a backlog card:
1. Create git worktree → `wt switch --create ACQ-145` (delegated to the `wt` CLI; lifecycle config in `.config/wt.toml`)
2. Create tmux session → `tmux new-session -d -s ACQ-145 -c /path/to/worktree`
3. Launch Claude with context → `tmux send-keys -t ACQ-145 "claude '/directiv:linear-code ACQ-145' --plugin-dir '<resource>/directiv-plugin'" Enter`
4. Open external terminal → Ghostty/iTerm2 attaches to tmux session
5. Update Linear → status to "In Progress", card moves to "In Dev"

Claude Code starts in interactive mode with `/directiv:linear-code <issue_id>` as the initial prompt, executing the skill immediately then remaining available for interaction.

### Skills (bundled plugin)

Skills are bundled inside the app as a Claude Code plugin — no user installation required.

- **Location:** `src-tauri/resources/directiv-plugin/` (bundled via `tauri.conf.json` → `bundle.resources`)
- **Plugin structure:** `.claude-plugin/plugin.json` + `skills/<skill-name>/SKILL.md`
- **Runtime resolution:** Rust command `get_plugin_dir` resolves the resource path; `list_plugin_skills` scans the `skills/` directory
- **Launch:** `workflows.ts` passes `--plugin-dir` to the `claude` CLI so skills are available as `/directiv:<skill-name>`
- **Start button:** defaults to `directiv:linear-code`, overridable via `skills` config
- **Available skills:** `linear-code`, `linear-plan`, `fix-ci`, `commit`, `create-pr`
- **Adding a skill:** create a new folder under `skills/` with a `SKILL.md`, rebuild the app

### Pipeline board columns

| Column | Source | Criteria |
|--------|--------|----------|
| Backlog | Linear | Assigned, not started |
| In Dev | Linear + tmux | Status "started" AND worktree/session exists |
| Personal Review | GitHub | PR opened, no reviewers assigned |
| In Review | GitHub | PR opened with reviewers |
| Approved | GitHub | PR with ≥1 approval, 0 changes requested |
| Done | Linear | Completed in last 24h |

## Authentication

Linear uses in-app OAuth. GitHub delegates authentication to the `gh` CLI (must be installed and authenticated externally). No API keys or `.env` variables needed. In release builds, Linear tokens are stored in the OS keyring (`com.directiv.app`). In dev builds, tokens are file-backed at `~/Library/Application Support/directiv/dev-tokens.json` to avoid keychain prompt loops.

- **Linear** — OAuth2 Web Flow (PKCE + localhost callback on port 19823). Tokens expire and are auto-refreshed.
- **GitHub** — Delegates to the `gh` CLI. Users must run `gh auth login` externally. The app checks auth status via `gh api user` and uses `gh api graphql` for all GitHub data. No token storage in the app.

**Auth flow:**
- `authStore.ts` manages state for both providers (`initializeLinearAuth`, `initializeGitHubAuth` on app mount)
- `AuthGate.tsx` blocks the app until both providers are connected. Shows setup instructions for `gh` CLI when GitHub is not connected.
- `tauriOAuth.ts` wraps Tauri `invoke()` calls for Linear OAuth commands
- `tauriGitHub.ts` wraps Tauri `invoke()` calls for `gh` CLI commands
- Cached Linear client factory: `getLinearClient()` (in `authStore.ts`, re-exported via `lib/linear.ts`)

## Configuration

User config lives at `~/Library/Application Support/directiv/config.json` (release) or `config.dev.json` (dev), using the same `#[cfg(debug_assertions)]` pattern as token storage. This prevents dev and prod builds from overwriting each other's settings. On first launch, the app auto-migrates from the legacy `directiv.config.json` at project root if found. Settings changed in the UI are auto-persisted via the `save_config` Tauri command.

- `terminal`: external emulator — `"ghostty"` or `"iterm2"`
- `editor`: code editor — `"zed"`, `"cursor"`, `"vscode"`, `"code"`
- `workspaces`: list of workspace paths containing git repositories
- `linear`: org-scoped team config — `Record<orgId, { name, teamIds }>`
- `theme`: `"dark"`, `"light"`, or `"system"`
- `skills`: optional skill overrides per action (`code`, `plan`, `fixCi`)
- `models`: optional model overrides per action (`code`, `plan`, `fixCi`)

**Per-repo worktree config** (`.config/wt.toml` at repo root, managed by the `wt` CLI):
- Lifecycle hooks (`onStart`, `beforeRemove`), `baseBranch`, `fetchBefore`, `copyPaths` — all delegated to `wt`. See `wt` documentation for schema details.
- Legacy `.directiv.json` files are no longer read by Directiv.

### UI layout

- **RootLayout** → `AuthGate` → `OnboardingGate` → page router
- **HomePage** — `ProjectSelector` (sidebar) + `DependencyGraph` (main canvas)
- **DependencyGraph** — ReactFlow DAG with custom nodes: `UnifiedTaskCard` (task cards with actions), `OrphanTaskCard` (worktrees without Linear issues), `GroupLabelNode` (cross-project labels)
- **Task card actions:** Start, Attach terminal, Logs, Stop, Open editor, Open PR, Merge, Archive
- **Dependency edges:** drag-to-create blocking relationships, right-click to delete
- **ConfigPage** — General, Integrations, Linear teams, Workspaces, Skills sections

## Code Conventions

- **Enums must be `as const` objects** — All enum-like values must be defined as an `as const` object with a derived type from its values. Never use TypeScript `enum` or plain union types for enums. Example:
  ```typescript
  export const MY_STATUSES = {
    ACTIVE: "active",
    INACTIVE: "inactive",
  } as const;

  export type MyStatus = (typeof MY_STATUSES)[keyof typeof MY_STATUSES];
  ```

- **Avoid useEffect anti-patterns** — Do not use `useEffect` to sync props to state, notify parents of derived values, or set state from other state. Instead:
  - **Derived values**: compute during render (or `useMemo` if expensive)
  - **Notify parent**: call in the event handler that triggered the change
  - **Reset state on prop change**: use the `key` prop to remount
  - **Sync to external store**: acceptable (e.g., TanStack Query → Zustand, or ReactFlow state), but consolidate into a single Effect

  Reference: [React docs — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

## Language

The architecture doc may be in French. Code identifiers, comments in code and commit messages should be in English.

## Documentation
Linear GrapQL API doc : https://studio.apollographql.com/public/Linear-API/variant/current/schema/reference
The Linear sdk follows the Linear GraphQL API conventions.

## Project Management Tool Configuration
pm-tool: obsidian
pm-vault: /Users/nicod/Documents/0-DEV/directiv-ws/Directiv Vault
