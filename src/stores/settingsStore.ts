import { create } from "zustand";
import type { DirectivConfig, TerminalEmulator } from "../types";
import {
  defaultConfig,
  loadConfigFromDisk,
  saveConfigToDisk,
} from "../lib/config";
import { toastError } from "../lib/toast";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(theme: DirectivConfig["theme"]): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyThemeToDOM(resolvedTheme: "light" | "dark"): void {
  if (resolvedTheme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

/** Resolve theme, apply to DOM, and return the partial state update. */
function applyConfig(config: DirectivConfig): {
  config: DirectivConfig;
  isLoaded: true;
  resolvedTheme: "light" | "dark";
} {
  const resolvedTheme = resolveTheme(config.theme);
  applyThemeToDOM(resolvedTheme);
  return { config, isLoaded: true, resolvedTheme };
}

interface SettingsState {
  config: DirectivConfig;
  isLoaded: boolean;
  resolvedTheme: "light" | "dark";
  setConfig: (config: DirectivConfig) => void;
  updateTerminal: (terminal: TerminalEmulator) => void;
  loadFromDisk: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  config: defaultConfig,
  isLoaded: false,
  resolvedTheme: resolveTheme(defaultConfig.theme),

  setConfig: (config) => {
    set(applyConfig(config));
    saveConfigToDisk(config).catch(toastError);
  },

  updateTerminal: (terminal) => {
    const updated = { ...get().config, terminal };
    get().setConfig(updated);
  },

  loadFromDisk: async () => {
    try {
      const config = await loadConfigFromDisk();
      set(applyConfig(config));

      // Listen for system theme changes when theme is "system"
      if (config.theme === "system") {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
          const current = get().config;
          if (current.theme === "system") {
            const newResolved = resolveTheme("system");
            applyThemeToDOM(newResolved);
            set({ resolvedTheme: newResolved });
          }
        };
        mediaQuery.addEventListener("change", handleChange);
      }
    } catch (err) {
      toastError(err);
      set(applyConfig(defaultConfig));
    }
  },
}));
