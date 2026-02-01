import { create } from "zustand";
import type { EnrichedTask, WorkflowColumn } from "../types";

interface WorkflowFilters {
  column: WorkflowColumn | null;
  search: string;
}

interface WorkflowState {
  tasks: EnrichedTask[];
  selectedTaskId: string | null;
  filters: WorkflowFilters;
  setTasks: (tasks: EnrichedTask[]) => void;
  updateTask: (id: string, patch: Partial<EnrichedTask>) => void;
  selectTask: (id: string | null) => void;
  setFilter: (filter: Partial<WorkflowFilters>) => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  tasks: [],
  selectedTaskId: null,
  filters: { column: null, search: "" },

  setTasks: (tasks) => set({ tasks }),

  updateTask: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  selectTask: (id) => set({ selectedTaskId: id }),

  setFilter: (filter) =>
    set((state) => ({
      filters: { ...state.filters, ...filter },
    })),
}));
