import { invoke } from "@tauri-apps/api/core";
import type { LinairConfig } from "../types";

export const defaultConfig: LinairConfig = {
  terminal: "ghostty",
  repos: [],
  linear: {
    teamIds: [],
    activeProject: null,
  },
  theme: "dark",
};

export async function loadConfigFromDisk(): Promise<LinairConfig> {
  const raw = await invoke<string>("load_config");
  const parsed = JSON.parse(raw) as Partial<LinairConfig>;
  return validateConfig(parsed);
}

export function validateConfig(config: Partial<LinairConfig>): LinairConfig {
  return {
    terminal: config.terminal ?? defaultConfig.terminal,
    repos: (config.repos ?? defaultConfig.repos).map((repo) => ({
      ...repo,
      copyPaths: repo.copyPaths ?? [],
      onStart: repo.onStart ?? [],
      baseBranch: repo.baseBranch,
      fetchBefore: repo.fetchBefore ?? true,
    })),
    linear: config.linear ?? defaultConfig.linear,
    theme: config.theme ?? defaultConfig.theme,
  };
}
