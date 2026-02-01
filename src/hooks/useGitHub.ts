import { useQuery } from "@tanstack/react-query";
import { octokit } from "../lib/github";
import type { PullRequestInfo } from "../types";

function mapPR(pr: {
  number: number;
  title: string;
  state: string;
  html_url: string;
  head: { ref: string };
  draft?: boolean;
  created_at: string;
  updated_at: string;
}): PullRequestInfo {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state as PullRequestInfo["state"],
    url: pr.html_url,
    branch: pr.head.ref,
    draft: pr.draft ?? false,
    reviews: [],
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
  };
}

export function useGitHubMyPRs(
  owner: string | undefined,
  repo: string | undefined,
) {
  return useQuery<PullRequestInfo[]>({
    queryKey: ["github", "my-prs", owner, repo],
    queryFn: async () => {
      if (!octokit || !owner || !repo) return [];
      const { data } = await octokit.pulls.list({
        owner,
        repo,
        state: "open",
      });
      return data.map(mapPR);
    },
    enabled: !!octokit && !!owner && !!repo,
    refetchInterval: 30_000,
  });
}

export function useGitHubReviewPRs(
  owner: string | undefined,
  repo: string | undefined,
) {
  return useQuery<PullRequestInfo[]>({
    queryKey: ["github", "review-prs", owner, repo],
    queryFn: async () => {
      if (!octokit || !owner || !repo) return [];
      const { data } = await octokit.pulls.list({
        owner,
        repo,
        state: "open",
      });
      return data.map(mapPR);
    },
    enabled: !!octokit && !!owner && !!repo,
    refetchInterval: 30_000,
  });
}
