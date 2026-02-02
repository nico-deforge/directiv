import { create } from "zustand";
import type { LinairConfig, TerminalEmulator } from "../types";
import { defaultConfig, loadConfigFromDisk } from "../lib/config";

interface SettingsState {
  config: LinairConfig;
  isLoaded: boolean;
  setConfig: (config: LinairConfig) => void;
  updateTerminal: (terminal: TerminalEmulator) => void;
  loadFromDisk: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  config: defaultConfig,
  isLoaded: false,

  setConfig: (config) => set({ config, isLoaded: true }),

  updateTerminal: (terminal) =>
    set((state) => ({
      config: { ...state.config, terminal },
    })),

  loadFromDisk: async () => {
    try {
      const config = await loadConfigFromDisk();
      set({ config, isLoaded: true });
    } catch (err) {
      console.warn("Failed to load linair.config.json:", err);
      set({ isLoaded: true });
    }
  },
}));
