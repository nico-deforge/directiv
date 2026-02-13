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

Directiv is a Tauri 2.0 desktop app that integrates Linear, GitHub, tmux, and git worktrees into a unified pipeline board. It delegates terminal operations to your preferred emulator (Ghostty, iTerm2) and uses tmux for session persistence.

## Tech Stack

- **App framework:** Tauri 2.0 (Rust backend in `src-tauri/`, React frontend in `src/`)
- **Frontend:** React + TypeScript, Zustand (state), Tailwind CSS, TanStack Query (data fetching), lucide-react (icons)
- **Backend:** Rust with `tauri-plugin-shell` for system commands, `serde` for serialization
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
- **Stores** (`src/stores/`) use Zustand: `workflowStore` (enriched tasks, filters), `settingsStore` (persisted user config)
- **Lib** (`src/lib/`) contains initialized SDK clients and business logic (`workflows.ts` handles `startTask`, `attachTask`, etc.)

### Backend commands (`src-tauri/src/commands/`)

- `worktree.rs` — git worktree add/remove/list
- `tmux.rs` — session create/kill/list/capture-pane
- `terminal.rs` — open external terminal attached to tmux session

### Core workflow: "Start Task"

Triggered by clicking [Start] on a backlog card:
1. Create git worktree → `git worktree add ../repo-worktrees/ACQ-145 -b ACQ-145 origin/main`
2. Create tmux session → `tmux new-session -d -s ACQ-145 -c /path/to/worktree`
3. Launch Claude with context → `tmux send-keys -t ACQ-145 'claude --plugin-dir "<resource>/claude-skills-plugin" "/directiv:linear-issue ACQ-145"' Enter`
4. Update Linear → status to "In Progress"
5. Refresh board → card moves to "In Dev"

Claude Code starts in interactive mode with `/directiv:linear-issue <issue_id>` as the initial prompt, executing the skill immediately then remaining available for interaction.

### Skills (bundled plugin)

Skills are bundled inside the app as a Claude Code plugin — no user installation required.

- **Location:** `src-tauri/resources/claude-skills-plugin/` (bundled via `tauri.conf.json` → `bundle.resources`)
- **Plugin structure:** `.claude-plugin/plugin.json` + `skills/<skill-name>/SKILL.md`
- **Runtime resolution:** Rust command `get_plugin_dir` resolves the resource path; `list_bundled_skills` scans the `skills/` directory
- **Launch:** `workflows.ts` passes `--plugin-dir` to the `claude` CLI so skills are available as `/directiv:<skill-name>`
- **Start button:** hardcoded to `directiv:linear-issue` — no config needed
- **Adding a skill:** create a new folder under `skills/` with a `SKILL.md`, rebuild the app

### Pipeline board columns

| Column | Source | Criteria |
|--------|--------|----------|
| Backlog | Linear | Assigned, not started |
| In Dev | Linear + tmux | Status "started" AND worktree/session exists |
| In Review | GitHub | PR opened linked to task |
| Approved | GitHub | PR with ≥1 approval, 0 changes requested |
| Done | Linear | Completed in last 24h |

## Configuration

User config lives in `directiv.config.json` at project root:
- `terminal`: preferred emulator (ghostty, iterm2)
- `repos`: list of repos with path and issue prefixes
- `linear`: team IDs, active project
- `github`: owner and repo names

## Code Conventions

- **Enums must be `as const` objects** — All enum-like values must be defined as an `as const` object with a derived type from its values. Never use TypeScript `enum` or plain union types for enums. Example:
  ```typescript
  export const MY_STATUSES = {
    ACTIVE: "active",
    INACTIVE: "inactive",
  } as const;

  export type MyStatus = (typeof MY_STATUSES)[keyof typeof MY_STATUSES];
  ```

## Language

The architecture doc may be in French. Code identifiers, comments in code and commit messages should be in English.

## Documentation
Linear GrapQL API doc : https://studio.apollographql.com/public/Linear-API/variant/current/schema/reference
The Linear sdk follows the Linear GraphQL API conventions.
