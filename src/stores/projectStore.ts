import { create } from "zustand";
import type { LinearProjectStatusType } from "../hooks/useLinear";

export type LinearConnectionStatus =
  | { status: "no-teams" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "connected" };

// Special project ID for orphan worktrees (worktrees without Linear tasks)
export const ORPHAN_PROJECT_ID = "__orphan__";

export interface Project {
  id: string;
  name: string;
  statusType: LinearProjectStatusType;
}

interface ProjectState {
  projects: Project[];
  hasOrphans: boolean;
  connectionStatus: LinearConnectionStatus;
  selectedProjectId: string | null;
  showBacklogProjects: boolean;
  setProjectsData: (
    projects: Project[],
    hasOrphans: boolean,
    connectionStatus: LinearConnectionStatus,
  ) => void;
  selectProject: (projectId: string | null) => void;
  toggleBacklogProjects: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  hasOrphans: false,
  connectionStatus: { status: "loading" },
  selectedProjectId: null,
  showBacklogProjects: false,

  setProjectsData: (projects, hasOrphans, connectionStatus) => {
    const { selectedProjectId } = get();
    const autoSelect =
      selectedProjectId === null && projects.length > 0
        ? projects[0].id
        : selectedProjectId;
    set({
      projects,
      hasOrphans,
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
