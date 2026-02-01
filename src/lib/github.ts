import { Octokit } from "@octokit/rest";

const token = import.meta.env.VITE_GITHUB_TOKEN as string | undefined;

export const octokit = token ? new Octokit({ auth: token }) : null;
