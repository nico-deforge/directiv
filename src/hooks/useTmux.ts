import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  tmuxListSessions,
  tmuxCreateSession,
  tmuxKillSession,
  tmuxCapturePane,
} from "../lib/tauri";
import { detectClaudeStates } from "../lib/claudeState";
import type { TmuxSession, ClaudeSessionStatus } from "../types";
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

export function useClaudeSessionStates(sessionNames: string[]) {
  const previousRef = useRef<Map<string, string> | null>(null);

  const sorted = [...sessionNames].sort();
  const key = sorted.join(",");

  return useQuery<Map<string, ClaudeSessionStatus>>({
    queryKey: ["tmux", "claude-states", key],
    queryFn: async () => {
      const entries = await Promise.all(
        sorted.map(async (name) => {
          try {
            const content = await tmuxCapturePane(name);
            return [name, content] as const;
          } catch {
            return null;
          }
        }),
      );

      const current = new Map<string, string>();
      for (const entry of entries) {
        if (entry) current.set(entry[0], entry[1]);
      }

      const states = detectClaudeStates(current, previousRef.current);
      previousRef.current = current;
      return states;
    },
    enabled: sorted.length > 0,
    refetchInterval: LOCAL_REFRESH_INTERVAL,
  });
}
