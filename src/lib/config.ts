import { invoke } from "@tauri-apps/api/core";
import type { DirectivConfig } from "../types";

export const defaultConfig: DirectivConfig = {
  terminal: "ghostty",
  editor: "zed",
  repos: [],
  linear: {
    teamIds: [],
    activeProject: null,
  },
  theme: "dark",
};

export async function loadConfigFromDisk(): Promise<DirectivConfig> {
  const raw = await invoke<string>("load_config");
  const parsed = JSON.parse(raw) as Partial<DirectivConfig>;
  return validateConfig(parsed);
}

export function validateConfig(config: Partial<DirectivConfig>): DirectivConfig {
  return {
    terminal: config.terminal ?? defaultConfig.terminal,
    editor: config.editor ?? defaultConfig.editor,
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
