import { Octokit } from "@octokit/rest";
import { getGitHubToken } from "./tauri";

let cachedOctokit: Octokit | null = null;
let tokenFetchFailed = false;

export async function getOctokit(): Promise<Octokit | null> {
  if (cachedOctokit) return cachedOctokit;
  if (tokenFetchFailed) return null;

  try {
    const token = await getGitHubToken();
    cachedOctokit = new Octokit({ auth: token });
    return cachedOctokit;
  } catch (error) {
    console.warn("GitHub CLI auth not available:", error);
    tokenFetchFailed = true;
    return null;
  }
}
