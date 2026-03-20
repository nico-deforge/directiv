import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  startTask,
  startFreeTask,
  type StartTaskParams,
} from "../lib/workflows";
import type { TerminalLayout } from "../types";

export function useStartTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: StartTaskParams) => startTask(params),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["linear"] });
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
    },
  });
}

interface StartFreeTaskParams {
  branchName: string;
  repoPath: string;
  terminal: string;
  terminalLayout?: TerminalLayout;
}

export function useStartFreeTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: StartFreeTaskParams) => startFreeTask(params),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
    },
  });
}
