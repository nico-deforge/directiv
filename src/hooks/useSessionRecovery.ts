import { useEffect, useRef } from "react";
import { tmuxListSessions } from "../lib/tauri";
import { toSessionName } from "../lib/tmux-utils";
import { useWorkflowStore } from "../stores/workflowStore";
import { useTerminalStore } from "../stores/terminalStore";

/**
 * Runs once at startup: scans active tmux sessions, matches them to "In Dev"
 * tasks by session name, and registers them in the terminalStore so the board
 * reflects the correct state without recreating any terminals.
 */
export function useSessionRecovery() {
  const hasRun = useRef(false);
  const tasks = useWorkflowStore((s) => s.tasks);

  useEffect(() => {
    if (hasRun.current) return;

    const inDevTasks = tasks.filter((t) => t.column === "in-dev");
    if (inDevTasks.length === 0) return;

    hasRun.current = true;

    tmuxListSessions()
      .then((sessions) => {
        const sessionNames = new Set(sessions.map((s) => s.name));
        let recovered = 0;

        for (const task of inDevTasks) {
          const name = toSessionName(task.identifier);
          if (sessionNames.has(name)) {
            useTerminalStore.getState().registerSession({
              sessionName: name,
              identifier: task.identifier,
              title: task.title,
            });
            recovered++;
          }
        }

        if (recovered > 0) {
          console.log(
            `[directiv] Session recovery: restored ${recovered} session(s)`,
          );
        }
      })
      .catch((err) => {
        console.warn("[directiv] Session recovery failed:", err);
      });
  }, [tasks]);
}
