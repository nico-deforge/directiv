import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LinairConfig, TerminalEmulator } from "../types";
import { loadConfig } from "../lib/config";

interface SettingsState {
  config: LinairConfig;
  isLoaded: boolean;
  setConfig: (config: LinairConfig) => void;
  updateTerminal: (terminal: TerminalEmulator) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      config: loadConfig(),
      isLoaded: true,

      setConfig: (config) => set({ config }),

      updateTerminal: (terminal) =>
        set((state) => ({
          config: { ...state.config, terminal },
        })),
    }),
    { name: "linair-settings" },
  ),
);
