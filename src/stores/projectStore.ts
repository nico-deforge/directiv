import { create } from "zustand";

// Special project ID for orphan worktrees (worktrees without Linear tasks)
export const ORPHAN_PROJECT_ID = "__orphan__";

export interface Project {
  id: string;
  name: string;
  statusType: "started" | "backlog";
}

interface ProjectState {
  // List of available projects derived from tasks
  projects: Project[];
  // Currently selected project ID (null = show all)
  selectedProjectId: string | null;
  // Whether to show backlog projects in the sidebar
  showBacklogProjects: boolean;
  // Actions
  setProjects: (projects: Project[]) => void;
  selectProject: (projectId: string | null) => void;
  toggleBacklogProjects: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  selectedProjectId: null,
  showBacklogProjects: false,

  setProjects: (projects) => set({ projects }),

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
