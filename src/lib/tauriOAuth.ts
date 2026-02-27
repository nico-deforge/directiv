import { invoke } from "@tauri-apps/api/core";

export function linearOAuthStart(): Promise<string> {
  return invoke<string>("linear_oauth_start");
}

export function linearGetValidToken(): Promise<string | null> {
  return invoke<string | null>("linear_get_valid_token");
}

export function linearOAuthDisconnect(): Promise<void> {
  return invoke<void>("linear_oauth_disconnect");
}
