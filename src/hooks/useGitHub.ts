import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOctokitClient } from "../lib/github";
import { useAuthStore, AUTH_PROVIDER_STATUS } from "../stores/authStore";
import type {
  CIStatus,
  DiscoveredRepo,
  PullRequestInfo,
  ReviewRequestedPR,
} from "../types";
import { EXTERNAL_API_REFRESH_INTERVAL } from "../constants/intervals";

const GITHUB_AUTH_ERROR_MSG =
  "GitHub access was revoked or blocked by your organization. Please reconnect.";

function isGitHubAuthError(err: unknown): boolean {
  if (err && typeof err === "object" && "status" in err) {
    if ((err as { status: number }).status === 401) return true;
  }
  return err instanceof Error && /Bad credentials/.test(err.message);
}

interface ReviewNode {
  author: { login: string } | null;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING";
  submittedAt: string;
}

interface ViewerPRNode {
  number: number;
  title: string;
  isDraft: boolean;
  url: string;
  headRefName: string;
  createdAt: string;
  updatedAt: string;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  reviewRequests: { totalCount: number };
  latestReviews: { nodes: ReviewNode[] };
  commits: {
    nodes: Array<{
      commit: {
        statusCheckRollup: {
          state: "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED";
        } | null;
      };
    }>;
  };
}

interface ViewerPRsResponse {
  viewer: {
    pullRequests: {
      nodes: ViewerPRNode[];
    };
  };
}

const QUERY = `
  query {
    viewer {
      pullRequests(states: OPEN, first: 50) {
        nodes {
          number
          title
          isDraft
          url
          headRefName
          createdAt
          updatedAt
          reviewDecision
          reviewRequests { totalCount }
          latestReviews(first: 10) {
            nodes {
              author { login }
              state
              submittedAt
            }
          }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
        }
      }
    }
  }
`;

function useIsGitHubConnected() {
  return useAuthStore((s) => s.githubStatus === AUTH_PROVIDER_STATUS.CONNECTED);
}

export function useGitHubMyOpenPRs() {
  const isConnected = useIsGitHubConnected();

  return useQuery<PullRequestInfo[]>({
    queryKey: ["github", "my-open-prs"],
    queryFn: async () => {
      const octokit = getOctokitClient();
      if (!octokit) return [];
      try {
        const data = await octokit.graphql<ViewerPRsResponse>(QUERY);
        return data.viewer.pullRequests.nodes.map((pr): PullRequestInfo => {
          const rollup = pr.commits.nodes[0]?.commit.statusCheckRollup ?? null;
          const ciStatus: CIStatus = rollup?.state ?? null;
          const ciUrl: string | null = rollup ? `${pr.url}/checks` : null;

          return {
            number: pr.number,
            title: pr.title,
            state: "open",
            url: pr.url,
            branch: pr.headRefName,
            draft: pr.isDraft,
            reviewDecision: pr.reviewDecision,
            requestedReviewerCount: pr.reviewRequests.totalCount,
            reviews: pr.latestReviews.nodes.map((r) => ({
              author: r.author?.login ?? "unknown",
              state: r.state,
              submittedAt: r.submittedAt,
            })),
            ciStatus,
            ciUrl,
            createdAt: pr.createdAt,
            updatedAt: pr.updatedAt,
          };
        });
      } catch (err) {
        if (isGitHubAuthError(err)) {
          await useAuthStore.getState().disconnectGitHub(GITHUB_AUTH_ERROR_MSG);
        }
        throw err;
      }
    },
    enabled: isConnected,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}

// --- Review Requests ---

interface ReviewRequestNode {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  repository: { nameWithOwner: string };
  author: { login: string } | null;
}

interface ReviewRequestsResponse {
  search: {
    nodes: ReviewRequestNode[];
  };
}

const REVIEW_REQUESTS_QUERY = `
  query {
    search(query: "is:open is:pr review-requested:@me", type: ISSUE, first: 25) {
      nodes {
        ... on PullRequest {
          number
          title
          url
          isDraft
          createdAt
          updatedAt
          repository { nameWithOwner }
          author { login }
        }
      }
    }
  }
`;

export function useGitHubReviewRequests() {
  const isConnected = useIsGitHubConnected();

  return useQuery<ReviewRequestedPR[]>({
    queryKey: ["github", "review-requests"],
    queryFn: async () => {
      const octokit = getOctokitClient();
      if (!octokit) return [];
      try {
        const data = await octokit.graphql<ReviewRequestsResponse>(
          REVIEW_REQUESTS_QUERY,
        );
        return data.search.nodes
          .filter((node) => node.number !== undefined)
          .map(
            (pr): ReviewRequestedPR => ({
              number: pr.number,
              title: pr.title,
              url: pr.url,
              repoName: pr.repository.nameWithOwner,
              authorLogin: pr.author?.login ?? "unknown",
              createdAt: pr.createdAt,
              updatedAt: pr.updatedAt,
              isDraft: pr.isDraft,
            }),
          );
      } catch (err) {
        if (isGitHubAuthError(err)) {
          await useAuthStore.getState().disconnectGitHub(GITHUB_AUTH_ERROR_MSG);
        }
        throw err;
      }
    },
    enabled: isConnected,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}

// --- Repo Access Check ---

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
      const blocked = new Set<string>();
      const octokit = getOctokitClient();
      if (!octokit) return blocked;
      for (const nwo of nwos) {
        try {
          const [owner, repo] = nwo.split("/");
          await octokit.rest.repos.get({ owner, repo });
        } catch (err) {
          if (err && typeof err === "object" && "status" in err) {
            const status = (err as { status: number }).status;
            if (status === 403 || status === 404) blocked.add(nwo);
          }
        }
      }
      return blocked;
    },
    enabled: isConnected && nwos.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
