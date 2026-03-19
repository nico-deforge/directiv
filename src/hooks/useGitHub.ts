import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore, AUTH_PROVIDER_STATUS } from "../stores/authStore";
import type {
  DiscoveredRepo,
  PullRequestInfo,
  ReviewRequestedPR,
} from "../types";
import { EXTERNAL_API_REFRESH_INTERVAL } from "../constants/intervals";
import {
  ghListMyOpenPRs,
  ghListReviewRequests,
  ghCheckRepoAccess,
} from "../lib/tauriGitHub";

export function useIsGitHubConnected() {
  return useAuthStore((s) => s.githubStatus === AUTH_PROVIDER_STATUS.CONNECTED);
}

async function handleGhError(err: unknown): Promise<never> {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[GitHub]", msg);
  if (
    msg.includes("auth login") ||
    msg.includes("not logged") ||
    msg.includes("not authenticated")
  ) {
    await useAuthStore
      .getState()
      .disconnectGitHub(
        "GitHub CLI authentication lost. Run `gh auth login` in your terminal.",
      );
  }
  throw err;
}

export function useGitHubMyOpenPRs() {
  const isConnected = useIsGitHubConnected();

  return useQuery<PullRequestInfo[]>({
    queryKey: ["github", "my-open-prs"],
    queryFn: () => ghListMyOpenPRs().catch(handleGhError),
    enabled: isConnected,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}

export function useGitHubReviewRequests() {
  const isConnected = useIsGitHubConnected();

  return useQuery<ReviewRequestedPR[]>({
    queryKey: ["github", "review-requests"],
    queryFn: () => ghListReviewRequests().catch(handleGhError),
    enabled: isConnected,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}

export function useGitHubRepoAccess(repos: DiscoveredRepo[]) {
  const isConnected = useIsGitHubConnected();
  const nwos = useMemo(
    () =>
      [...new Set(repos.map((r) => r.githubNwo).filter(Boolean))] as string[],
    [repos],
  );

  return useQuery<Set<string>>({
    queryKey: ["github", "repo-access", ...nwos],
    queryFn: async () => {
      try {
        const results = await Promise.all(
          nwos.map(async (nwo) => ({
            nwo,
            accessible: await ghCheckRepoAccess(nwo),
          })),
        );
        const blocked = new Set<string>();
        for (const { nwo, accessible } of results) {
          if (!accessible) blocked.add(nwo);
        }
        return blocked;
      } catch (err) {
        return handleGhError(err);
      }
    },
    enabled: isConnected && nwos.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
