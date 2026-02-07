# Directiv

**The Directed Acyclic Graph orchestrator for AI agents.**

---

Modern software teams don't just write code — they orchestrate complex workflows across multiple tools, contexts, and AI assistants. Directiv is the command center that brings order to this chaos.

## The Problem

Your development workflow is scattered:
- **Linear** holds your tasks, but doesn't know what's actually being worked on
- **GitHub** tracks PRs, but disconnected from the original intent
- **AI agents** are powerful, but launching them with the right context is manual
- **Git worktrees** enable parallel work, but managing them is tedious
- **Terminal sessions** get lost, and context dies with them

You spend more time switching between tools than actually building.

## The Solution

Directiv models your development pipeline as a **Directed Acyclic Graph**, where each task flows through well-defined stages — from backlog to deployment — with AI agents executing each node autonomously.

### One-click task orchestration

Click **[Start]** on any backlog item, and Directiv:

1. Creates an isolated git worktree for the task
2. Spawns a persistent tmux session
3. Launches Claude Code with full Linear context
4. Updates your task status automatically
5. Moves the card to "In Dev" on your board

No context-switching. No copy-pasting issue descriptions. No manual setup.

### Real-time pipeline visibility

| Backlog | In Dev | In Review | Approved | Done |
|---------|--------|-----------|----------|------|
| Linear tasks assigned to you | Active worktrees + tmux sessions | Open PRs linked to tasks | PRs with approvals | Completed in last 24h |

Every column pulls from the source of truth — Linear, GitHub, and your local dev environment — unified in one view.

### Parallel execution

Work on multiple tasks simultaneously. Each task gets:
- Its own git worktree (isolated branch)
- Its own tmux session (persistent terminal state)
- Its own AI agent instance (full context)

Switch between tasks instantly. Never lose your place.

## Features

- **Linear integration** — Sync tasks, update statuses, link PRs automatically
- **GitHub integration** — Track PRs, reviews, and merge status
- **Git worktree management** — Create, switch, and cleanup worktrees via GUI
- **tmux orchestration** — Persistent sessions that survive terminal crashes
- **Terminal delegation** — Works with Ghostty, iTerm2
- **Claude Code integration** — Launch AI agents with issue context pre-loaded
- **Multi-repo support** — Manage multiple repositories from one board

## Tech Stack

- **Framework:** Tauri 2.0 (Rust backend, React frontend)
- **Frontend:** React, TypeScript, Zustand, TanStack Query, Tailwind CSS
- **Integrations:** Linear SDK, Octokit, tmux, git worktree

## Getting Started

```bash
# Install dependencies
bun install

# Run in development
bun run tauri:dev

# Build for production
bun run tauri:build
```

## Configuration

### Global configuration

Create `directiv.config.json` in your home directory or project root:

```jsonc
{
  "terminal": "ghostty" | "iterm2",
  "editor": "zed" | "cursor" | "vscode" | "code",
  "workspaces": [
    {
      "id": "work",
      "name": "Work Projects",
      "path": "/path/to/workspace"    // Parent folder containing your git repositories
    }
  ],
  "linear": {
    "teamIds": ["TEAM_ID"],           // Team IDs or keys (e.g., "ENG" or UUID)
    "activeProject": null | "PROJECT_ID"
  },
  "theme": "system" | "light" | "dark"
}
```

### Environment Variables

Create a `.env` file at the project root with your API keys:

```bash
# Required for Linear integration
VITE_LINEAR_API_KEY=lin_api_xxxxx    # Get from Linear Settings > API

# Required for GitHub integration
VITE_GITHUB_TOKEN=ghp_xxxxx          # Personal Access Token (repo scope)
```

> **Note:** Vite requires the `VITE_` prefix to expose variables to the frontend.
> Both `.env` and `.env.local` are supported (`.env.local` is gitignored).

### Per-repository configuration

Create `.directiv.json` at the root of each repository:

```jsonc
{
  "copyPaths": [           // Files/folders to copy into new worktrees
    ".claude/settings.local.json",
    ".env.local",
    "node_modules"
  ],
  "onStart": ["bun install"],  // Commands to run after worktree creation
  "baseBranch": "main" | "master" | "develop",
  "fetchBefore": true | false
}
```

## Deployment

> **🚧 Work in Progress**
>
> Pre-built binaries and distribution packages are not yet available.
> For now, you need to build from source (see Contributing section below).
>
> Planned:
> - [ ] macOS `.dmg` release
> - [ ] Auto-update mechanism
> - [ ] Homebrew formula

---

## Contributing

### Prerequisites

Directiv requires several tools to be installed on your system.

#### System requirements

- **macOS** (Linux and Windows support planned)
- **git** (2.20+)
- **tmux** (3.0+)

```bash
# macOS (Homebrew)
brew install git tmux
```

#### mise (recommended)

[mise](https://mise.jdx.dev/) manages tool versions (Bun, Rust) and provides project tasks:

```bash
# macOS (Homebrew)
brew install mise

# Activate in your shell (add to ~/.zshrc or ~/.bashrc)
eval "$(mise activate zsh)"
```

With mise installed, `bun` and `rust` are automatically installed at the correct versions when you enter the project directory.

**Optional tmux configuration** (`~/.config/tmux/tmux.conf`):

```bash
# True Color support (24-bit)
set -as terminal-features ",xterm-ghostty:RGB"  # Ghostty
# set -as terminal-features ",xterm-256color:RGB" # iTerm2

# Default terminal
set -g default-terminal "tmux-256color"

# No escape delay (better for vim/neovim)
set -s escape-time 0

# Mouse support
set -g mouse on
```

#### Rust toolchain

Install Rust via rustup:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable
```

Minimum version: **Rust 1.77.2**

#### Bun (JavaScript runtime)

```bash
curl -fsSL https://bun.sh/install | bash
```

Or via Homebrew:

```bash
brew install oven-sh/bun/bun
```

#### Claude Code

For AI agent integration:

```bash
npm install -g @anthropic-ai/claude-code
```

> **🚧 Skills support is a work in progress**
>
> For now, you need a local Claude Code skill named `linear-issue` that takes the Linear ticket ID as argument.
>
> Example skill location: `~/.claude/skills/linear-issue/SKILL.md`

### Clone and setup

```bash
git clone https://github.com/nico-deforge/directiv.git
cd directiv

# With mise (recommended) — installs correct bun & rust versions automatically
mise install
mise run install     # alias: mise run i

# Without mise
bun install
```

### Development commands

```bash
# Full Tauri app (frontend + backend)
mise run dev

# Frontend only (Vite dev server)
mise run dev:frontend

# Code quality
mise run check            # All checks (tsc + lint + format) in parallel
mise run tsc              # Type-check only
mise run lint             # ESLint only
mise run lint:fix         # ESLint with auto-fix
mise run format           # Format with Prettier

# Rust backend
mise run rust:build       # Build
mise run rust:test        # Run tests
mise run rust:clippy      # Lint with clippy
mise run rust:check       # All Rust checks

# Build for production
mise run build

# List all available tasks
mise tasks
```

> **Note:** All `bun run` scripts from `package.json` still work directly (e.g., `bun run tauri:dev`).

### Project structure

```
directiv/
├── src/                  # React frontend
│   ├── components/       # UI components
│   ├── hooks/            # TanStack Query hooks
│   ├── stores/           # Zustand stores
│   ├── lib/              # SDK clients, business logic
│   └── types/            # TypeScript types
├── src-tauri/            # Rust backend
│   └── src/
│       ├── commands/     # Tauri commands (worktree, tmux, terminal)
│       └── lib.rs        # Main entry point
└── directiv.config.json  # User configuration
```

## License

Apache 2.0
