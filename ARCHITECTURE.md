# Directiv - Dev Workflow Cockpit

## Vision

Interface de pilotage unifiée pour orchestrer le développement assisté par IA. Un seul endroit pour voir où j'en suis, lancer mes agents, et avancer dans mes workflows.

**Problème résolu** : Le multi-tool fatigue — jongler entre Linear, GitHub, Sentry, et plusieurs terminaux sans vue d'ensemble claire.

---

## Stack technique

| Layer | Tech | Justification |
|-------|------|---------------|
| Framework | **Tauri 2.0** | App native légère (~10MB), accès système complet pour spawn tmux/gtr |
| Frontend | **React + TypeScript** | Productivité, écosystème mature |
| State | **Zustand** | Simple, performant, pas de boilerplate |
| Styling | **Tailwind** | Itération rapide sur l'UI |
| Linear | **@linear/sdk** | SDK TypeScript typé officiel, pas de GraphQL manuel |
| GitHub | **Octokit** | SDK officiel, bien maintenu |
| Data fetching | **TanStack Query** | Cache intelligent, polling, invalidation |
| Sessions | **tmux** | Persistance, API robuste, `capture-pane` pour les logs |
| Terminal | **Configurable** | Ghostty par défaut, support iTerm2/Terminal.app/Alacritty |

---

## Architecture projet

```
pilot/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── commands/
│   │       ├── mod.rs
│   │       ├── worktree.rs      # git gtr new/rm/list
│   │       ├── tmux.rs          # Sessions : create/kill/list/capture
│   │       └── terminal.rs      # Ouvrir terminal externe (attach)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── Workflow/
│   │   │   ├── WorkflowBoard.tsx    # Vue pipeline principale
│   │   │   ├── WorkflowColumn.tsx   # Colonne par étape
│   │   │   ├── TaskCard.tsx         # Carte tâche avec actions contextuelles
│   │   │   └── TaskDetail.tsx       # Panel détail latéral
│   │   ├── Sessions/
│   │   │   ├── SessionList.tsx      # Sessions tmux actives
│   │   │   ├── SessionCard.tsx      # État d'une session
│   │   │   └── LogsModal.tsx        # Affichage capture-pane
│   │   └── Layout/
│   │       ├── Sidebar.tsx
│   │       └── Header.tsx
│   ├── hooks/
│   │   ├── useLinear.ts             # Wrapper @linear/sdk + TanStack Query
│   │   ├── useGitHub.ts             # Wrapper Octokit + TanStack Query
│   │   ├── useTmux.ts               # Invoke Tauri commands tmux
│   │   └── useWorktrees.ts          # Invoke Tauri commands gtr
│   ├── stores/
│   │   ├── workflowStore.ts         # État global : tâches enrichies, filtres
│   │   └── settingsStore.ts         # Config utilisateur persistée
│   ├── lib/
│   │   ├── linear.ts                # Client Linear initialisé
│   │   ├── github.ts                # Client Octokit initialisé
│   │   └── workflows.ts             # Logique métier : startTask, attachTask...
│   └── types/
│       └── index.ts
├── package.json
└── directiv.config.json              # Config utilisateur (repos, terminal, teams)
```

---

## Intégrations

### Linear (via @linear/sdk)

| Donnée | Usage |
|--------|-------|
| Mes tâches assignées | Alimenter le board |
| État des tâches | Colonnes du workflow |
| Projet en cours | Progress bar, scope |
| Commentaires | Contexte dans le détail |
| Mise à jour statut | Passer "In Progress" au start |

### GitHub (via Octokit)

| Donnée | Usage |
|--------|-------|
| Mes PRs draft | Colonne "In Dev" |
| PRs où je suis reviewer | Section "À reviewer" |
| PRs avec approval | Colonne "Approved" |
| Statut CI/checks | Indicateur sur la carte |

### tmux (via Tauri commands)

| Commande | Usage |
|----------|-------|
| `list-sessions` | Afficher sessions actives |
| `new-session` | Créer session pour une tâche |
| `send-keys` | Lancer `claude` dans la session |
| `capture-pane` | Afficher les logs dans Directiv |
| `kill-session` | Nettoyer après merge |

### Terminal externe

Directiv ne fait **pas** d'émulation de terminal. Il délègue à ton terminal préféré :

| Action | Comportement |
|--------|--------------|
| **[Attach]** | Ouvre Ghostty (ou autre) attaché à la session tmux |
| **[Logs]** | Affiche `capture-pane` dans une modal Directiv |

Configuration du terminal dans `directiv.config.json` (Ghostty, iTerm2, Terminal.app, Alacritty).

---

## UI Orientée Workflow

### Philosophie

- **Pas un dashboard de métriques** → Un board d'actions
- **Chaque carte = 1 tâche avec son ID** → ACQ-145, BUG-089
- **Les colonnes = étapes du workflow** → Pas les statuts Linear bruts
- **Actions contextuelles** → Ce que je peux faire maintenant sur cette tâche

### Pipeline Board

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🎯 Directiv                                  [Settings] [Refresh] [+ Task]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐     │
│  │ 📥 BACKLOG│ │ 🔧 IN DEV │ │ 👀 REVIEW │ │ ✅ APPROVED│ │ 🚀 DONE   │     │
│  ├───────────┤ ├───────────┤ ├───────────┤ ├───────────┤ ├───────────┤     │
│  │           │ │           │ │           │ │           │ │           │     │
│  │  ACQ-167  │ │  ACQ-145  │ │  ACQ-142  │ │  ACQ-138  │ │  ACQ-130  │     │
│  │  ────────│ │  🟢 tmux  │ │  PR #234  │ │  PR #231  │ │           │     │
│  │  [Start] │ │  [Attach] │ │  2 reviews│ │  [Merge]  │ │           │     │
│  │           │ │           │ │           │ │           │ │           │     │
│  │  BUG-089  │ │  ACQ-156  │ │           │ │           │ │           │     │
│  │  🔴 P1    │ │  ⚪ idle  │ │           │ │           │ │           │     │
│  │  [Start] │ │  [Launch] │ │           │ │           │ │           │     │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘     │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ⚡ SESSIONS ACTIVES                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ 🟢 ACQ-145 │ api    │ claude running │ 3m  │ [Attach] [Logs] [Stop]    ││
│  │ ⚪ ACQ-156 │ api    │ idle           │ -   │ [Launch Claude] [Editor]  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Colonnes et leur logique

| Colonne | Source de données | Critères |
|---------|-------------------|----------|
| **Backlog** | Linear | Tâches assignées, non started, ou marquées "aujourd'hui" |
| **In Dev** | Linear + tmux | Statut "started" ET worktree/session existe |
| **In Review** | GitHub | PR ouverte liée à la tâche |
| **Approved** | GitHub | PR avec ≥1 approval, 0 changes requested |
| **Done** | Linear | Complétées dans les dernières 24h (pour feedback) |

### Actions par colonne

| Colonne | Actions |
|---------|---------|
| Backlog | `[Start]` → Crée worktree + session tmux + lance Claude |
| In Dev (idle) | `[Launch Claude]` `[Open Editor]` `[Create PR]` |
| In Dev (running) | `[Attach]` `[Logs]` `[Stop]` |
| In Review | `[Attach]` `[View PR]` `[Request Review]` |
| Approved | `[Merge]` `[View PR]` |

---

## Workflow "Start Task"

Séquence déclenchée par **[Start]** :

1. **Créer worktree** → `git gtr new ACQ-145`
2. **Créer session tmux** → `tmux new-session -d -s ACQ-145 -c /path/to/worktree`
3. **Lancer Claude avec contexte** → `tmux send-keys -t ACQ-145 'claude "/linear-issue ACQ-145"' Enter`
4. **Mettre à jour Linear** → Statut → "In Progress"
5. **Rafraîchir le board** → La carte passe en "In Dev"

Claude Code est lancé en mode interactif avec `/linear-issue <issue_id>` comme message initial. Il exécute le skill immédiatement au démarrage, puis reste disponible pour l'interaction.

---

## Configuration utilisateur

Fichier `directiv.config.json` :

| Section | Contenu |
|---------|---------|
| `terminal` | Émulateur préféré (ghostty, iterm2, terminal, alacritty) |
| `repos` | Liste des repos avec chemin et préfixes d'issues |
| `linear` | Team IDs, projet actif |
| `github` | Owner/repo pour chaque repo |

---

## Roadmap

| Version | Scope |
|---------|-------|
| **v0.1** | Board basique + sessions tmux + Linear read |
| **v0.2** | Intégration GitHub PRs |
| **v0.3** | Actions complètes (Start, Attach, Merge) |
| **v0.4** | Notifications (PR approved, blocked) |
| **v0.5** | Raccourcis clavier globaux |
| **v1.0** | Multi-repo, multi-projet, polish UI |

---

## Dépendances clés

**Frontend**
- `@linear/sdk` : SDK Linear typé
- `@octokit/rest` : SDK GitHub
- `@tanstack/react-query` : Data fetching
- `zustand` : State management
- `lucide-react` : Icônes

**Backend (Rust/Tauri)**
- `tauri` : Framework app native
- `tauri-plugin-shell` : Exécution commandes système
- `serde` : Serialization

**Système**
- `tmux` : Multiplexeur terminal
- `git-worktree-runner (gtr)` : Gestion worktrees
- Terminal au choix : Ghostty, iTerm2, etc.
