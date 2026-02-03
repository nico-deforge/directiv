import { useQuery } from "@tanstack/react-query";
import { octokit } from "../lib/github";
import type { PullRequestInfo } from "../types";
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
