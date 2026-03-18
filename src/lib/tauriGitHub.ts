import { invoke } from "@tauri-apps/api/core";
import type { PullRequestInfo, ReviewRequestedPR } from "../types";

export interface GhAuthInfo {
  username: string;
}

export function ghAuthStatus(): Promise<GhAuthInfo> {
  return invoke<GhAuthInfo>("gh_auth_status");
}

export function ghListMyOpenPRs(): Promise<PullRequestInfo[]> {
  return invoke<PullRequestInfo[]>("gh_list_my_open_prs");
}

export function ghListReviewRequests(): Promise<ReviewRequestedPR[]> {
  return invoke<ReviewRequestedPR[]>("gh_list_review_requests");
}

export function ghCheckRepoAccess(nwo: string): Promise<boolean> {
  return invoke<boolean>("gh_check_repo_access", { nwo });
}
