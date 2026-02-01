import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { worktreeList, worktreeCreate, worktreeRemove } from "../lib/tauri";
import type { WorktreeInfo } from "../types";

export function useWorktrees() {
  return useQuery<WorktreeInfo[]>({
    queryKey: ["worktrees"],
    queryFn: worktreeList,
    refetchInterval: 10_000,
  });
}

export function useWorktreeCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (issueId: string) => worktreeCreate(issueId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["worktrees"] }),
  });
}

export function useWorktreeRemove() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (branch: string) => worktreeRemove(branch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["worktrees"] }),
  });
}
