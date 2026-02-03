import { useQuery } from "@tanstack/react-query";
import { octokit } from "../lib/github";
import type { PullRequestInfo, ReviewRequestedPR } from "../types";
import { EXTERNAL_API_REFRESH_INTERVAL } from "../constants/intervals";

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
  reviewRequests: { totalCount: number };
  latestReviews: { nodes: ReviewNode[] };
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
          reviewRequests { totalCount }
          latestReviews(first: 10) {
            nodes {
              author { login }
              state
              submittedAt
            }
          }
        }
      }
    }
  }
`;

export function useGitHubMyOpenPRs() {
  return useQuery<PullRequestInfo[]>({
    queryKey: ["github", "my-open-prs"],
    queryFn: async () => {
      if (!octokit) return [];
      const data = await octokit.graphql<ViewerPRsResponse>(QUERY);
      return data.viewer.pullRequests.nodes.map(
        (pr): PullRequestInfo => ({
          number: pr.number,
          title: pr.title,
          state: "open",
          url: pr.url,
          branch: pr.headRefName,
          draft: pr.isDraft,
          requestedReviewerCount: pr.reviewRequests.totalCount,
          reviews: pr.latestReviews.nodes.map((r) => ({
            author: r.author?.login ?? "unknown",
            state: r.state,
            submittedAt: r.submittedAt,
          })),
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
        }),
      );
    },
    enabled: !!octokit,
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
  return useQuery<ReviewRequestedPR[]>({
    queryKey: ["github", "review-requests"],
    queryFn: async () => {
      if (!octokit) return [];
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
    },
    enabled: !!octokit,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}
