import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  tmuxListSessions,
  tmuxCreateSession,
  tmuxKillSession,
  tmuxCapturePane,
  cmuxCapturePane,
  queryTerminals,
  cmuxCloseWorkspace,
} from "../lib/tauri";
import { detectClaudeStates } from "../lib/claudeState";
import { useSettingsStore } from "../stores/settingsStore";
import type { TmuxSession, ClaudeSessionStatus } from "../types";
import { LOCAL_REFRESH_INTERVAL } from "../constants/intervals";

/**
 * List active sessions for the configured terminal backend.
 *
 * For tmux-based backends (ghostty, iterm2): polls tmux directly.
 * For cmux: synthesizes TmuxSession records from `query_terminals("cmux")`
 * so that the board can detect active workspaces without depending on tmux.
 *
 * The synthesized TmuxSession uses workspace_name as the session name
 * (matching the identifier used in toSessionName()), attached=true,
 * and placeholder values for windows/created.
 */
export function useTmuxSessions() {
  const terminal = useSettingsStore((s) => s.config.terminal);
  const isCmux = terminal === "cmux";

  return useQuery<TmuxSession[]>({
    queryKey: ["terminal-sessions", terminal],
    queryFn: async () => {
      if (isCmux) {
        const statuses = await queryTerminals("cmux");
        return statuses.map((s) => ({
          name: s.sessionName,
          attached: s.active,
          windows: 1,
          created: "",
        }));
      }
      return tmuxListSessions();
    },
    refetchInterval: LOCAL_REFRESH_INTERVAL,
  });
}

export function useTmuxCreateSession() {
  const queryClient = useQueryClient();
  const terminal = useSettingsStore((s) => s.config.terminal);
  const isCmux = terminal === "cmux";

  return useMutation({
    mutationFn: async ({
      name,
      workingDir,
    }: {
      name: string;
      workingDir?: string;
    }) => {
      // cmux creates sessions via CmuxController.create (open_terminal), not via tmux
      if (isCmux) return;
      await tmuxCreateSession(name, workingDir);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] }),
  });
}

export function useTmuxKillSession() {
  const queryClient = useQueryClient();
  const terminal = useSettingsStore((s) => s.config.terminal);
  const isCmux = terminal === "cmux";

  return useMutation({
    mutationFn: (name: string) => {
      if (isCmux) return cmuxCloseWorkspace(name);
      return tmuxKillSession(name);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] }),
  });
}

export function useTmuxCapturePane(session: string | undefined) {
  const terminal = useSettingsStore((s) => s.config.terminal);
  const isCmux = terminal === "cmux";

  return useQuery<string>({
    queryKey: ["tmux", "capture", session, terminal],
    queryFn: () => {
      if (isCmux) return cmuxCapturePane(session!);
      return tmuxCapturePane(session!);
    },
    enabled: !!session,
    refetchInterval: LOCAL_REFRESH_INTERVAL,
  });
}

export function useClaudeSessionStates(sessionNames: string[]) {
  const previousRef = useRef<Map<string, string> | null>(null);
  const terminal = useSettingsStore((s) => s.config.terminal);
  const isCmux = terminal === "cmux";

  const sorted = [...sessionNames].sort();
  const key = sorted.join(",");

  return useQuery<Map<string, ClaudeSessionStatus>>({
    queryKey: ["tmux", "claude-states", key, terminal],
    queryFn: async () => {
      const capture = isCmux ? cmuxCapturePane : tmuxCapturePane;
      const entries = await Promise.all(
        sorted.map(async (name) => {
          try {
            const content = await capture(name);
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
