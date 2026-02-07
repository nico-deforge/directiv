import { useMutation, useQueryClient } from "@tanstack/react-query";
import { startTask, startFreeTask } from "../lib/workflows";

interface StartTaskParams {
  issueId: string;
  identifier: string;
  repoPath: string;
  terminal: string;
  copyPaths?: string[];
  onStart?: string[];
  baseBranch?: string;
  fetchBefore?: boolean;
}

export function useStartTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: StartTaskParams) => startTask(params),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["linear"] });
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
    },
  });
}

interface StartFreeTaskParams {
  branchName: string;
  repoPath: string;
  terminal: string;
  copyPaths?: string[];
  onStart?: string[];
  baseBranch?: string;
  fetchBefore?: boolean;
}

export function useStartFreeTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: StartFreeTaskParams) => startFreeTask(params),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
    },
  });
}
