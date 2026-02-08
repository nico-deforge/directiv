import { create } from "zustand";

// Special project ID for orphan worktrees (worktrees without Linear tasks)
export const ORPHAN_PROJECT_ID = "__orphan__";

export interface Project {
  id: string;
  name: string;
}

interface ProjectState {
  // List of available projects derived from tasks
  projects: Project[];
  // Currently selected project ID (null = show all)
  selectedProjectId: string | null;
  // Actions
  setProjects: (projects: Project[]) => void;
  selectProject: (projectId: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  selectedProjectId: null,

  setProjects: (projects) => set({ projects }),

  selectProject: (projectId) => set({ selectedProjectId: projectId }),
}));
