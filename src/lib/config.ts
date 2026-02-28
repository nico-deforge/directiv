import { invoke } from "@tauri-apps/api/core";
import type { DirectivConfig, WorkspaceConfig } from "../types";

export const defaultConfig: DirectivConfig = {
  terminal: "ghostty",
  terminalMode: "internal",
  editor: "zed",
  workspaces: [],
  linear: {
    teamIds: [],
  },
  theme: "dark",
};

export async function loadConfigFromDisk(): Promise<DirectivConfig> {
  const raw = await invoke<string>("load_config");
  let parsed: Partial<DirectivConfig>;
  try {
    parsed = JSON.parse(raw) as Partial<DirectivConfig>;
  } catch (e) {
    const detail = e instanceof SyntaxError ? `: ${e.message}` : "";
    throw new Error(
      `Config file contains invalid JSON and could not be loaded${detail}`,
    );
  }
  return validateConfig(parsed);
}

export async function saveConfigToDisk(config: DirectivConfig): Promise<void> {
  await invoke("save_config", { json: JSON.stringify(config, null, 2) });
}

export function validateConfig(
  config: Partial<DirectivConfig>,
): DirectivConfig {
  return {
    terminal: config.terminal ?? defaultConfig.terminal,
    terminalMode: config.terminalMode ?? defaultConfig.terminalMode,
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
    skills: config.skills,
  };
}
