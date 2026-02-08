import { invoke } from "@tauri-apps/api/core";
import type { DirectivConfig, WorkspaceConfig } from "../types";

export const defaultConfig: DirectivConfig = {
  terminal: "ghostty",
  editor: "zed",
  workspaces: [],
  linear: {
    teamIds: [],
  },
  theme: "dark",
  skills: [],
};

export async function loadConfigFromDisk(): Promise<DirectivConfig> {
  const raw = await invoke<string>("load_config");
  const parsed = JSON.parse(raw) as Partial<DirectivConfig>;
  return validateConfig(parsed);
}

export function validateConfig(
  config: Partial<DirectivConfig>,
): DirectivConfig {
  return {
    terminal: config.terminal ?? defaultConfig.terminal,
    editor: config.editor ?? defaultConfig.editor,
    workspaces: (config.workspaces ?? defaultConfig.workspaces).map(
      (ws): WorkspaceConfig => ({
        id: ws.id,
        name: ws.name,
        path: ws.path,
      }),
    ),
    linear: config.linear ?? defaultConfig.linear,
    theme: config.theme ?? defaultConfig.theme,
    skills: (config.skills ?? []).filter(
      (s) => typeof s.skill === "string" && typeof s.label === "string",
    ),
  };
}
