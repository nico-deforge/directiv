import type { LinairConfig } from "../types";

const defaultConfig: LinairConfig = {
  terminal: "ghostty",
  repos: [],
  linear: {
    teamIds: [],
    activeProject: null,
  },
  github: {
    owner: "",
    repos: [],
  },
};

export function loadConfig(): LinairConfig {
  return defaultConfig;
}

export function validateConfig(config: Partial<LinairConfig>): LinairConfig {
  return {
    terminal: config.terminal ?? defaultConfig.terminal,
    repos: config.repos ?? defaultConfig.repos,
    linear: config.linear ?? defaultConfig.linear,
    github: config.github ?? defaultConfig.github,
  };
}
