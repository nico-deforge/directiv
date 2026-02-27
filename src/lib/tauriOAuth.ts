import { invoke } from "@tauri-apps/api/core";
import type { DeviceCodeResponse } from "../types";

// --- Linear ---

export function linearOAuthStart(): Promise<string> {
  return invoke<string>("linear_oauth_start");
}

export function linearGetValidToken(): Promise<string | null> {
  return invoke<string | null>("linear_get_valid_token");
}

export function linearOAuthDisconnect(): Promise<void> {
  return invoke<void>("linear_oauth_disconnect");
}

// --- GitHub ---

export function githubOAuthStart(): Promise<DeviceCodeResponse> {
  return invoke<DeviceCodeResponse>("github_oauth_start");
}

export function githubOAuthPoll(
  deviceCode: string,
  interval: number,
  expiresIn: number,
): Promise<string> {
  return invoke<string>("github_oauth_poll", {
    deviceCode,
    interval,
    expiresIn,
  });
}

export function githubGetToken(): Promise<string | null> {
  return invoke<string | null>("github_get_token");
}

export function githubOAuthDisconnect(): Promise<void> {
  return invoke<void>("github_oauth_disconnect");
}
