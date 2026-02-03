import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  tmuxListSessions,
  tmuxCreateSession,
  tmuxKillSession,
  tmuxCapturePane,
} from "../lib/tauri";
import type { TmuxSession } from "../types";
import { LOCAL_REFRESH_INTERVAL } from "../constants/intervals";

export function useTmuxSessions() {
  return useQuery<TmuxSession[]>({
    queryKey: ["tmux", "sessions"],
    queryFn: tmuxListSessions,
    refetchInterval: LOCAL_REFRESH_INTERVAL,
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
    refetchInterval: LOCAL_REFRESH_INTERVAL,
  });
}
