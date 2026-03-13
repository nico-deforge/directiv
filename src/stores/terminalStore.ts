import { create } from "zustand";

export interface TerminalTab {
  sessionName: string;
  identifier: string;
  title: string;
}

interface TerminalState {
  tabs: TerminalTab[];
  activeTab: "board" | string;
  openTerminal: (tab: TerminalTab) => void;
  closeTerminal: (sessionName: string) => void;
  focusTab: (tab: "board" | string) => void;
  registerSession: (tab: TerminalTab) => void;
}

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  tabs: [],
  activeTab: "board",

  openTerminal: (tab) => {
    const { tabs } = get();
    const exists = tabs.some((t) => t.sessionName === tab.sessionName);
    if (!exists) {
      set({ tabs: [...tabs, tab], activeTab: tab.sessionName });
    } else {
      set({ activeTab: tab.sessionName });
    }
  },

  closeTerminal: (sessionName) => {
    const { tabs, activeTab } = get();
    const next = tabs.filter((t) => t.sessionName !== sessionName);
    set({
      tabs: next,
      activeTab: activeTab === sessionName ? "board" : activeTab,
    });
  },

  focusTab: (tab) => set({ activeTab: tab }),

  registerSession: (tab) => {
    const { tabs } = get();
    if (tabs.some((t) => t.sessionName === tab.sessionName)) return;
    set({ tabs: [...tabs, tab] });
  },
}));
