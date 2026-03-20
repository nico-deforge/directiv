import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { wtList } from "../lib/tauri";
import {
  removeWorktreeFlow,
  type RemoveWorktreeFlowParams,
} from "../lib/workflows";
import type { WorktreeInfo, DiscoveredRepo } from "../types";
import { LOCAL_REFRESH_INTERVAL_SLOW } from "../constants/intervals";

export interface RepoWorktrees {
  repoId: string;
  repoPath: string;
  worktrees: WorktreeInfo[];
}

export function useAllWorktrees(repos: DiscoveredRepo[]) {
  return useQuery<RepoWorktrees[]>({
    queryKey: ["worktrees", "all", repos.map((r) => r.id).join(",")],
    queryFn: async () => {
      const results: RepoWorktrees[] = [];
      for (const repo of repos) {
        try {
          const worktrees = await wtList(repo.path);
          results.push({
            repoId: repo.id,
            repoPath: repo.path,
            worktrees,
          });
        } catch (err) {
          console.warn("[useAllWorktrees]", repo.path, err);
        }
      }
      return results;
    },
    enabled: repos.length > 0,
    refetchInterval: LOCAL_REFRESH_INTERVAL_SLOW,
  });
}

export function useWorktrees(repoPath: string) {
  return useQuery<WorktreeInfo[]>({
    queryKey: ["worktrees", repoPath],
    queryFn: () => wtList(repoPath),
    enabled: !!repoPath,
    refetchInterval: LOCAL_REFRESH_INTERVAL_SLOW,
  });
}

export function useWorktreeRemove() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: RemoveWorktreeFlowParams) =>
      removeWorktreeFlow(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
    },
  });
}
