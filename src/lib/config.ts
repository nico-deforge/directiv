import { invoke } from "@tauri-apps/api/core";
import type {
  DirectivConfig,
  LinearOrgConfig,
  WorkspaceConfig,
} from "../types";

export const defaultConfig: DirectivConfig = {
  terminal: "ghostty",
  editor: "zed",
  workspaces: [],
  linear: {},
  theme: "system",
  sidebarCollapsed: false,
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

function isValidLinearRecord(
  value: unknown,
): value is Record<string, LinearOrgConfig> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return true;
  // Reject old format: { teamIds: [...] } (pre-org-scoped config)
  if (
    entries.length === 1 &&
    entries[0][0] === "teamIds" &&
    Array.isArray(entries[0][1])
  )
    return false;
  return entries.every(
    ([, v]) =>
      typeof v === "object" &&
      v !== null &&
      "teamIds" in v &&
      Array.isArray((v as LinearOrgConfig).teamIds) &&
      typeof (v as LinearOrgConfig).name === "string",
  );
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
    linear: isValidLinearRecord(config.linear) ? config.linear : {},
    theme: config.theme ?? defaultConfig.theme,
    skills: config.skills,
    models: config.models,
    onboardingCompleted: config.onboardingCompleted ?? false,
    sidebarCollapsed: config.sidebarCollapsed ?? false,
  };
}
