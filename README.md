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

- **Linear integration** — OAuth2, sync tasks, update statuses, link PRs automatically
- **GitHub integration** — OAuth Device Flow, track PRs, reviews, and merge status
- **Git worktree management** — Create, switch, and cleanup worktrees via GUI
- **tmux orchestration** — Persistent sessions that survive terminal crashes
- **Integrated terminal** — Built-in xterm.js terminal connected to tmux via Rust PTY, with full-screen tab system
- **External terminal fallback** — Optional delegation to Ghostty or iTerm2 via `terminalMode: "external"` config
- **Claude Code integration** — Launch AI agents with issue context pre-loaded
- **Fix CI** — One-click button on failing PRs to launch Claude with the `fix-ci` skill
- **Multi-repo support** — Manage multiple repositories from one board

## Tech Stack

- **Framework:** Tauri 2.0 (Rust backend, React frontend)
- **Frontend:** React, TypeScript, Zustand, TanStack Query, Tailwind CSS, xterm.js
- **Backend:** Rust with portable-pty (PTY management), tauri-plugin-shell (system commands)
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

Config is stored at `~/Library/Application Support/directiv/config.json`. Settings changed in the UI are auto-persisted. The file is created automatically on first launch — you can also create it manually:

```jsonc
{
  "terminal": "ghostty" | "iterm2",       // External emulator (used when terminalMode is "external")
  "terminalMode": "internal" | "external", // "internal" (default): built-in xterm.js terminal
                                           // "external": delegates to Ghostty/iTerm2
  "editor": "zed" | "cursor" | "vscode" | "code",
  "workspaces": [
    {
      "id": "work",
      "name": "Work Projects",
      "path": "/path/to/workspace"    // Parent folder containing your git repositories
    }
  ],
  "linear": {
    "<orgId>": {                       // Org-scoped team config (auto-populated via UI)
      "name": "My Organization",
      "teamIds": ["TEAM_ID"]
    }
  },
  "theme": "system" | "light" | "dark",
  "skills": {                            // Global skill overrides (optional)
    "code": "my-org:implementation-skill",
    "plan": "my-org:planning-skill",
    "fixCi": "my-org:fix-ci-skill"
  }
}
```

> **Terminal mode:** By default, Directiv uses a built-in terminal (xterm.js + Rust PTY) that renders tmux sessions directly in the app as full-screen tabs. To revert to the previous behavior of opening Ghostty or iTerm2, set `"terminalMode": "external"` in your config.

### Authentication

Both Linear and GitHub use OAuth — connect via the app UI on first launch. No API keys or environment variables needed.

- **Linear** — OAuth2 Web Flow. Clicking "Connect" opens the Linear authorization page in your browser.
- **GitHub** — Device Flow (same pattern as `gh auth login`). Clicking "Connect" opens github.com/login/device and displays a one-time code to enter.

Tokens are stored securely in your OS keyring (release builds) or in `~/Library/Application Support/directiv/dev-tokens.json` (dev builds).

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
  "beforeRemove": [],          // Commands to run before worktree deletion
  "baseBranch": "main" | "master" | "develop",
  "fetchBefore": true | false,
  "skills": {              // Override Claude Code skills (optional)
    "code": "my-org:implementation-skill",
    "plan": "my-org:planning-skill",
    "fixCi": "my-org:fix-ci-skill"
  }
}
```

> **Note:** Hooks (`onStart`, `beforeRemove`) run in the user's login shell (`$SHELL -lc`), so your full PATH from `.zshrc` / `.bashrc` is available. Commands like `psql`, `mise`, or Homebrew-installed tools will work as expected.
>
> `beforeRemove` hooks run while the worktree directory still exists, so you can use them to save state, backup files, or run cleanup scripts. If a hook fails, the removal is aborted.

#### Skill overrides

By default, the **Code**, **Plan**, and **Fix CI** buttons launch Claude Code with the bundled Directiv plugin (`--plugin-dir`) and built-in skills (`directiv:linear-code`, `directiv:linear-plan`, `directiv:fix-ci`). You can override skills at two levels:

**Global overrides** — in global config, apply to all repos:

```jsonc
{
  "skills": {
    "code": "my-org:implementation-skill",
    "plan": "my-org:planning-skill",
    "fixCi": "my-org:fix-ci-skill"
  }
}
```

**Per-repo overrides** — in `.directiv.json`, apply to a single repo:

```jsonc
{
  "skills": {
    "code": "my-org:repo-specific-skill",
    "plan": "my-org:repo-specific-plan",
    "fixCi": "my-org:repo-specific-fix-ci"
  }
}
```

**Priority chain:** repo `.directiv.json` > global config > bundled plugin defaults.

When `skills` is present with at least one override (at either level), the bundled `--plugin-dir` flag is omitted — Claude Code will rely on the repo's own plugin/skill setup instead. All fields (`code`, `plan`, `fixCi`) are optional; omit any to keep the default skill name (but still without `--plugin-dir`). An empty `"skills": {}` is a no-op and the bundled plugin is still used.

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
set -as terminal-features ",xterm-256color:RGB"  # Integrated terminal + iTerm2
set -as terminal-features ",xterm-ghostty:RGB"   # Ghostty (external mode)

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

Directiv ships with a bundled Claude Code plugin containing the `linear-code`, `linear-plan`, and `fix-ci` skills. When you click **[Start]** on a task, Claude Code is launched with `--plugin-dir` pointing to the bundled plugin, so skills like `/directiv:linear-code` and `/directiv:fix-ci` are available out of the box — no manual skill installation required. You can also override skills per-repo to use your own — see [Skill overrides](#skill-overrides).

#### GitHub CLI (strongly recommended)

The [GitHub CLI](https://cli.github.com/) (`gh`) is strongly recommended for Claude Code to interact with GitHub (create PRs, review code, manage issues, etc.):

```bash
brew install gh
gh auth login
```

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
│   ├── assets/fonts/     # Bundled fonts (JetBrains Mono)
│   ├── components/       # UI components
│   │   ├── Board/        # Task cards, dependency graph
│   │   ├── Terminal/     # TerminalPanel (xterm.js), TabBar
│   │   └── Layout/       # RootLayout with tab system
│   ├── hooks/            # TanStack Query hooks
│   ├── stores/           # Zustand stores (workflow, settings, terminal)
│   ├── lib/              # SDK clients, business logic, PTY wrappers
│   └── types/            # TypeScript types
├── src-tauri/            # Rust backend
│   └── src/
│       ├── commands/     # Tauri commands (worktree, tmux, pty, terminal, oauth)
│       │   └── oauth/    # OAuth module (shared keyring, Linear Web Flow, GitHub Device Flow)
│       └── lib.rs        # Main entry point
└── .directiv.json        # Per-repo configuration
```

## License

Apache 2.0
