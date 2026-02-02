import { useQuery } from "@tanstack/react-query";
import { octokit } from "../lib/github";
import type { PullRequestInfo } from "../types";

interface ViewerPRNode {
  number: number;
  title: string;
  isDraft: boolean;
  url: string;
  headRefName: string;
  createdAt: string;
  updatedAt: string;
  reviewRequests: { totalCount: number };
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
          reviews: [],
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
        }),
      );
    },
    enabled: !!octokit,
    refetchInterval: 30_000,
  });
}
