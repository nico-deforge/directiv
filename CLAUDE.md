# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Directiv** is a unified dev workflow cockpit — a Tauri 2.0 desktop app that orchestrates AI-assisted development by integrating Linear, GitHub, tmux, and git worktrees into a single pipeline board.

The app does NOT emulate a terminal. It delegates to the user's preferred terminal (Ghostty, iTerm2, Terminal.app, Alacritty) and uses tmux for session persistence.

## Tech Stack

- **App framework:** Tauri 2.0 (Rust backend in `src-tauri/`, React frontend in `src/`)
- **Frontend:** React + TypeScript, Zustand (state), Tailwind CSS, TanStack Query (data fetching), lucide-react (icons)
- **Backend:** Rust with `tauri-plugin-shell` for system commands, `serde` for serialization
- **Integrations:** `@linear/sdk`, `@octokit/rest`, tmux CLI, `git-worktree-runner` (gtr)

## Build & Dev Commands

```bash
# Install
bun install                    # Install frontend dependencies

# Dev
bun run dev                    # Start Vite dev server (frontend only)
bun run tauri:dev              # Run full Tauri app in dev mode

# Build
bun run tauri:build            # Build production app

# Checks
bun run tsc                    # Type-check (no emit)
bun run lint                   # ESLint
bun run format                 # Prettier format

# Rust backend only
cd src-tauri && cargo build
cd src-tauri && cargo test
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

- `worktree.rs` — git gtr new/rm/list
- `tmux.rs` — session create/kill/list/capture-pane
- `terminal.rs` — open external terminal attached to tmux session

### Core workflow: "Start Task"

Triggered by clicking [Start] on a backlog card:
1. Create git worktree → `git gtr new ACQ-145`
2. Create tmux session → `tmux new-session -d -s ACQ-145 -c /path/to/worktree`
3. Launch Claude with context → `tmux send-keys -t ACQ-145 'claude "/linear-issue ACQ-145"' Enter`
4. Update Linear → status to "In Progress"
5. Refresh board → card moves to "In Dev"

Claude Code starts in interactive mode with `/linear-issue <issue_id>` as the initial prompt, executing the skill immediately then remaining available for interaction.

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
- `terminal`: preferred emulator (ghostty, iterm2, terminal, alacritty)
- `repos`: list of repos with path and issue prefixes
- `linear`: team IDs, active project
- `github`: owner and repo names

## Language

The architecture doc may be in French. Code identifiers, comments in code and commit messages should be in English.

## Documentation
Linear GrapQL API doc : https://studio.apollographql.com/public/Linear-API/variant/current/schema/reference
The Linear sdk follows the Linear GraphQL API conventions.
