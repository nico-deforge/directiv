import type { Octokit } from "@octokit/rest";
import { getOctokitClient } from "../stores/authStore";

export async function getValidOctokitClient(): Promise<Octokit | null> {
  return getOctokitClient(); // No refresh needed — OAuth App tokens don't expire
}
