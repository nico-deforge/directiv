import { useMutation, useQueryClient } from "@tanstack/react-query";
import { stopTask } from "../lib/workflows";

interface StopTaskParams {
  identifier: string;
  repoPaths: string[];
}

export function useStopTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: StopTaskParams) => stopTask(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
    },
  });
}
