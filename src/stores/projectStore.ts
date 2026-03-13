import { create } from "zustand";
import type { LinearProjectStatusType } from "../hooks/useLinear";

export type LinearConnectionStatus =
  | { status: "no-teams" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "connected" };

// Special project ID for orphan worktrees (worktrees without Linear tasks)
export const ORPHAN_PROJECT_ID = "__orphan__";

// Virtual project for issues assigned to the user that have no project or belong to a non-member project
export const OTHER_ISSUES_PROJECT_ID = "__other_issues__";

export interface Project {
  id: string;
  name: string;
  statusType: LinearProjectStatusType;
}

interface ProjectState {
  projects: Project[];
  hasOrphans: boolean;
  hasOtherIssues: boolean;
  connectionStatus: LinearConnectionStatus;
  selectedProjectId: string | null;
  showBacklogProjects: boolean;
  setProjectsData: (data: {
    projects: Project[];
    hasOrphans: boolean;
    hasOtherIssues: boolean;
    connectionStatus: LinearConnectionStatus;
  }) => void;
  selectProject: (projectId: string | null) => void;
  toggleBacklogProjects: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  hasOrphans: false,
  hasOtherIssues: false,
  connectionStatus: { status: "loading" },
  selectedProjectId: null,
  showBacklogProjects: false,

  setProjectsData: ({
    projects,
    hasOrphans,
    hasOtherIssues,
    connectionStatus,
  }) => {
    const { selectedProjectId } = get();
    let autoSelect = selectedProjectId;

    if (autoSelect === null && projects.length > 0) {
      autoSelect = projects[0].id;
    }
    if (autoSelect === OTHER_ISSUES_PROJECT_ID && !hasOtherIssues) {
      autoSelect = projects.length > 0 ? projects[0].id : null;
    }
    if (autoSelect === ORPHAN_PROJECT_ID && !hasOrphans) {
      autoSelect = projects.length > 0 ? projects[0].id : null;
    }

    set({
      projects,
      hasOrphans,
      hasOtherIssues,
      connectionStatus,
      selectedProjectId: autoSelect,
    });
  },

  selectProject: (projectId) => set({ selectedProjectId: projectId }),

  toggleBacklogProjects: () => {
    const { showBacklogProjects, selectedProjectId, projects } = get();

    // If turning off and current project is backlog, auto-select first started project
    if (showBacklogProjects && selectedProjectId) {
      const selected = projects.find((p) => p.id === selectedProjectId);
      if (selected?.statusType === "backlog") {
        const firstStarted = projects.find((p) => p.statusType === "started");
        set({
          showBacklogProjects: false,
          selectedProjectId: firstStarted?.id ?? null,
        });
        return;
      }
    }

    set({ showBacklogProjects: !showBacklogProjects });
  },
}));
