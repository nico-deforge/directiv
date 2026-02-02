import { useMutation, useQueryClient } from "@tanstack/react-query";
import { startTask } from "../lib/workflows";

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linear"] });
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
    },
  });
}
