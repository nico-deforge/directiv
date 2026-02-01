import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  tmuxListSessions,
  tmuxCreateSession,
  tmuxKillSession,
  tmuxCapturePane,
} from "../lib/tauri";
import type { TmuxSession } from "../types";

export function useTmuxSessions() {
  return useQuery<TmuxSession[]>({
    queryKey: ["tmux", "sessions"],
    queryFn: tmuxListSessions,
    refetchInterval: 5_000,
  });
}

export function useTmuxCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, workingDir }: { name: string; workingDir?: string }) =>
      tmuxCreateSession(name, workingDir),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["tmux", "sessions"] }),
  });
}

export function useTmuxKillSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => tmuxKillSession(name),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["tmux", "sessions"] }),
  });
}

export function useTmuxCapturePane(session: string | undefined) {
  return useQuery<string>({
    queryKey: ["tmux", "capture", session],
    queryFn: () => tmuxCapturePane(session!),
    enabled: !!session,
    refetchInterval: 5_000,
  });
}
