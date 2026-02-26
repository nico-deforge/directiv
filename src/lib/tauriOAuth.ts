import { invoke } from "@tauri-apps/api/core";

export interface OAuthStatus {
  has_token: boolean;
  expires_at: number | null;
  is_expired: boolean;
}

export function linearOAuthStart(): Promise<string> {
  return invoke<string>("linear_oauth_start");
}

export function linearOAuthRefresh(): Promise<string> {
  return invoke<string>("linear_oauth_refresh");
}

export function linearGetValidToken(): Promise<string | null> {
  return invoke<string | null>("linear_get_valid_token");
}

export function linearOAuthStatus(): Promise<OAuthStatus> {
  return invoke<OAuthStatus>("linear_oauth_status");
}

export function linearOAuthDisconnect(): Promise<void> {
  return invoke<void>("linear_oauth_disconnect");
}
