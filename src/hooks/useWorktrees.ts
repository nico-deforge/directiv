import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { worktreeList, worktreeCreate, worktreeRemove } from "../lib/tauri";
import type { WorktreeInfo } from "../types";

export function useWorktrees(repoPath: string) {
  return useQuery<WorktreeInfo[]>({
    queryKey: ["worktrees", repoPath],
    queryFn: () => worktreeList(repoPath),
    enabled: !!repoPath,
    refetchInterval: 10_000,
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
