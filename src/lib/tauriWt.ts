import { invoke } from "@tauri-apps/api/core";

export interface WtVersionInfo {
  version: string;
}

export function wtVersion(): Promise<WtVersionInfo> {
  return invoke<WtVersionInfo>("wt_version");
}

export function wtRemove(repoPath: string, branchName: string): Promise<void> {
  return invoke<void>("wt_remove", { repoPath, branchName });
}
