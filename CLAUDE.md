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

Directiv is a Tauri 2.0 desktop app that integrates Linear, GitHub, tmux, and git worktrees into a unified pipeline board. It features a built-in terminal (xterm.js + Rust PTY) for seamless tmux session interaction, with an optional fallback to external emulators (Ghostty, iTerm2).

## Tech Stack

- **App framework:** Tauri 2.0 (Rust backend in `src-tauri/`, React frontend in `src/`)
- **Frontend:** React + TypeScript, Zustand (state), Tailwind CSS, TanStack Query (data fetching), lucide-react (icons)
- **Backend:** Rust with `tauri-plugin-shell` for system commands, `portable-pty` for PTY management, `serde` for serialization
- **Terminal:** xterm.js (frontend) + portable-pty (Rust) connected via Tauri Channels for ordered streaming
- **Integrations:** `@linear/sdk`, `@octokit/rest`, tmux CLI, git worktree
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

- **Hooks** (`src/hooks/`) wrap SDK clients with TanStack Query for caching/polling: `useLinear`, `useGitHub`, `useTmux`, `useWorktrees`
- **Stores** (`src/stores/`) use Zustand: `workflowStore` (enriched tasks, filters), `settingsStore` (persisted user config), `terminalStore` (terminal tab lifecycle), `authStore` (OAuth state for Linear + GitHub, cached SDK client factories)
- **Lib** (`src/lib/`) contains initialized SDK clients and business logic (`workflows.ts` handles `startTask`, `removeWorktreeFlow`, etc.)

### Backend commands (`src-tauri/src/commands/`)

- `worktree.rs` — git worktree add/remove/list
- `tmux.rs` — session create/kill/list/capture-pane
- `pty.rs` — PTY spawn/write/resize/close for the integrated terminal (xterm.js ↔ Tauri Channel ↔ Rust PTY ↔ tmux attach)
- `terminal.rs` — open external terminal attached to tmux session (legacy/fallback)
- `config.rs` — `load_config` / `save_config` commands. Config lives at `~/Library/Application Support/directiv/config.json` (release) or `config.dev.json` (dev), using the same `#[cfg(debug_assertions)]` pattern as `shared.rs`. On first load, auto-migrates from legacy project-root `directiv.config.json` if found.
- `oauth/` — OAuth module directory:
  - `shared.rs` — `keyring_get/set/delete` helpers with `#[cfg]` dual implementation: file-backed store (`dev-tokens.json`) in dev builds (no keychain prompts), OS keyring in release. Also exports `OAuthStatus` and `now_secs()`.
  - `linear.rs` — Linear OAuth2 Web Flow (PKCE + localhost callback)
  - `github.rs` — GitHub OAuth Device Flow (no `client_secret`, tokens don't expire)

### Integrated terminal

The app embeds a full terminal emulator using **xterm.js** connected to tmux sessions through a Rust PTY backend:

- **Architecture:** xterm.js (frontend) ↔ Tauri Channel (ordered streaming) ↔ portable-pty (Rust) ↔ `tmux attach -t <session>`
- **Tab system:** full-screen tabs in `RootLayout` — Board tab + terminal tabs. All tabs stay mounted (CSS `hidden`) so the Board keeps polling and terminals keep their PTY connection.
- **Store:** `terminalStore` (Zustand) manages tab lifecycle (open/close/focus)
- **Components:** `TerminalPanel` (xterm.js wrapper with FitAddon, WebLinksAddon, ResizeObserver), `TabBar` (tab navigation, hidden when no terminals are open)
- **PTY commands:** `pty_spawn` (creates PTY + reader thread), `pty_write`, `pty_resize`, `pty_close` (detaches tmux cleanly before killing child)
- **Font:** JetBrains Mono bundled in `src/assets/fonts/`, loaded via `@font-face` in `index.css`

**Retrocompatibility:** set `"terminalMode": "external"` in config to use Ghostty/iTerm2 instead of the built-in terminal. Default is `"internal"`.

### Core workflow: "Start Task"

Triggered by clicking [Start] on a backlog card:
1. Create git worktree → `git worktree add ../repo-worktrees/ACQ-145 -b ACQ-145 origin/main`
2. Create tmux session → `tmux new-session -d -s ACQ-145 -c /path/to/worktree`
3. Launch Claude with context → `tmux send-keys -t ACQ-145 'claude --plugin-dir "<resource>/directiv-plugin" "/directiv:linear-code ACQ-145"' Enter`
4. Update Linear → status to "In Progress"
5. Open terminal tab → PTY attaches to tmux session, card moves to "In Dev"

Claude Code starts in interactive mode with `/directiv:linear-code <issue_id>` as the initial prompt, executing the skill immediately then remaining available for interaction.

### Skills (bundled plugin)

Skills are bundled inside the app as a Claude Code plugin — no user installation required.

- **Location:** `src-tauri/resources/directiv-plugin/` (bundled via `tauri.conf.json` → `bundle.resources`)
- **Plugin structure:** `.claude-plugin/plugin.json` + `skills/<skill-name>/SKILL.md`
- **Runtime resolution:** Rust command `get_plugin_dir` resolves the resource path; `list_plugin_skills` scans the `skills/` directory
- **Launch:** `workflows.ts` passes `--plugin-dir` to the `claude` CLI so skills are available as `/directiv:<skill-name>`
- **Start button:** hardcoded to `directiv:linear-code` — no config needed
- **Adding a skill:** create a new folder under `skills/` with a `SKILL.md`, rebuild the app

### Pipeline board columns

| Column | Source | Criteria |
|--------|--------|----------|
| Backlog | Linear | Assigned, not started |
| In Dev | Linear + tmux | Status "started" AND worktree/session exists |
| In Review | GitHub | PR opened linked to task |
| Approved | GitHub | PR with ≥1 approval, 0 changes requested |
| Done | Linear | Completed in last 24h |

## Authentication

Both Linear and GitHub use OAuth — no API keys or `.env` variables needed. In release builds, tokens are stored in the OS keyring (`com.directiv.app`). In dev builds, tokens are file-backed at `~/Library/Application Support/directiv/dev-tokens.json` to avoid keychain prompt loops.

- **Linear** — OAuth2 Web Flow (PKCE + localhost callback on port 19823). Tokens expire and are auto-refreshed.
- **GitHub** — OAuth Device Flow (same pattern as `gh` CLI). Uses an OAuth App (`client_id` only, no `client_secret`). Tokens don't expire — no refresh logic needed.

**Auth flow:**
- `authStore.ts` manages state for both providers (`initializeLinearAuth`, `initializeGitHubAuth` on app mount)
- `AuthGate.tsx` blocks the app until both providers are connected
- `tauriOAuth.ts` wraps Tauri `invoke()` calls to Rust OAuth commands
- Cached SDK client factories: `getLinearClient()` and `getOctokitClient()` (in `authStore.ts`, re-exported via `lib/linear.ts` and `lib/github.ts`)

## Configuration

User config lives at `~/Library/Application Support/directiv/config.json` (release) or `config.dev.json` (dev), using the same `#[cfg(debug_assertions)]` pattern as token storage. This prevents dev and prod builds from overwriting each other's settings. On first launch, the app auto-migrates from the legacy `directiv.config.json` at project root if found. Settings changed in the UI are auto-persisted via the `save_config` Tauri command.

- `terminal`: preferred external emulator — `"ghostty"` or `"iterm2"` (used when `terminalMode` is `"external"`)
- `terminalMode`: `"internal"` (default, built-in xterm.js) or `"external"` (delegates to Ghostty/iTerm2)
- `editor`: code editor — `"zed"`, `"cursor"`, `"vscode"`, `"code"`
- `workspaces`: list of workspace paths containing git repositories
- `linear`: org-scoped team config — `Record<orgId, { name, teamIds }>`
- `theme`: `"dark"`, `"light"`, or `"system"`

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
