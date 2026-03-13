import { create } from "zustand";

export interface ExternalSession {
  sessionName: string;
  identifier: string;
  title: string;
  worktreePath: string;
  active: boolean;
}

interface TerminalState {
  sessions: ExternalSession[];
  registerSession: (session: Omit<ExternalSession, "active">) => void;
  unregisterSession: (sessionName: string) => void;
  updateSessionStatus: (sessionName: string, active: boolean) => void;
}

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  sessions: [],

  registerSession: (session) => {
    const { sessions } = get();
    if (sessions.some((s) => s.sessionName === session.sessionName)) return;
    set({ sessions: [...sessions, { ...session, active: true }] });
  },

  unregisterSession: (sessionName) => {
    set({
      sessions: get().sessions.filter((s) => s.sessionName !== sessionName),
    });
  },

  updateSessionStatus: (sessionName, active) => {
    set({
      sessions: get().sessions.map((s) =>
        s.sessionName === sessionName ? { ...s, active } : s,
      ),
    });
  },
}));
