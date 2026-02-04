import { create } from "zustand";
import type { DirectivConfig, TerminalEmulator } from "../types";
import { defaultConfig, loadConfigFromDisk } from "../lib/config";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(theme: DirectivConfig["theme"]): "light" | "dark" {
  if (theme === "system") {
    return getSystemTheme();
  }
  return theme;
}

function applyThemeToDOM(resolvedTheme: "light" | "dark") {
  if (resolvedTheme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
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
    const resolved = resolveTheme(config.theme);
    applyThemeToDOM(resolved);
    set({ config, isLoaded: true, resolvedTheme: resolved });
  },

  updateTerminal: (terminal) =>
    set((state) => ({
      config: { ...state.config, terminal },
    })),

  loadFromDisk: async () => {
    try {
      const config = await loadConfigFromDisk();
      const resolved = resolveTheme(config.theme);
      applyThemeToDOM(resolved);
      set({ config, isLoaded: true, resolvedTheme: resolved });

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
      console.warn("Failed to load directiv.config.json:", err);
      const resolved = resolveTheme(defaultConfig.theme);
      applyThemeToDOM(resolved);
      set({ isLoaded: true, resolvedTheme: resolved });
    }
  },
}));
