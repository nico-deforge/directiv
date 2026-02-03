import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { worktreeList, worktreeCreate, worktreeRemove } from "../lib/tauri";
import type { WorktreeInfo, RepoConfig } from "../types";
import { LOCAL_REFRESH_INTERVAL_SLOW } from "../constants/intervals";

export interface RepoWorktrees {
  repoId: string;
  repoPath: string;
  worktrees: WorktreeInfo[];
}

export function useAllWorktrees(repos: RepoConfig[]) {
  return useQuery<RepoWorktrees[]>({
    queryKey: ["worktrees", "all", repos.map((r) => r.id).join(",")],
    queryFn: async () => {
      const results: RepoWorktrees[] = [];
      for (const repo of repos) {
        try {
          const worktrees = await worktreeList(repo.path);
          results.push({
            repoId: repo.id,
            repoPath: repo.path,
            worktrees,
          });
        } catch {
          // Skip repos that fail
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
    queryFn: () => worktreeList(repoPath),
    enabled: !!repoPath,
    refetchInterval: LOCAL_REFRESH_INTERVAL_SLOW,
  });
}

export function useWorktreeCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      issueId,
      copyPaths,
    }: {
      repoPath: string;
      issueId: string;
      copyPaths?: string[];
    }) => worktreeCreate(repoPath, issueId, copyPaths),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["worktrees"] }),
  });
}

export function useWorktreeRemove() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoPath,
      worktreePath,
    }: {
      repoPath: string;
      worktreePath: string;
    }) => worktreeRemove(repoPath, worktreePath),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["worktrees"] }),
  });
}
