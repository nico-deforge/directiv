import { invoke } from "@tauri-apps/api/core";

export interface WtVersionInfo {
  version: string;
}

export function wtVersion(): Promise<WtVersionInfo> {
  return invoke<WtVersionInfo>("wt_version");
}
