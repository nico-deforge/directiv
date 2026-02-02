import { useMutation, useQueryClient } from "@tanstack/react-query";
import { stopTask, checkBeforeStop } from "../lib/workflows";

interface StopTaskParams {
  identifier: string;
  repoPaths: string[];
}

export class DirtyWorktreeError extends Error {
  identifier: string;
  constructor(identifier: string) {
    super(`Worktree for ${identifier} has uncommitted changes`);
    this.name = "DirtyWorktreeError";
    this.identifier = identifier;
  }
}

export function useStopTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: StopTaskParams & { force?: boolean }) => {
      if (!params.force) {
        const check = await checkBeforeStop(params);
        if (check.isDirty) {
          throw new DirtyWorktreeError(params.identifier);
        }
      }
      await stopTask(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tmux"] });
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
    },
  });
}
