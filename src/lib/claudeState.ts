import type { ClaudeSessionStatus } from "../types";

/**
 * Compare current and previous pane snapshots to detect session states.
 * - Content changed → "active" (Claude is streaming output)
 * - Content stable → "waiting" (Claude is waiting for user input)
 * - No previous snapshot → "unknown" (need at least 2 polls)
 */
export function detectClaudeStates(
  current: Map<string, string>,
  previous: Map<string, string> | null,
): Map<string, ClaudeSessionStatus> {
  const result = new Map<string, ClaudeSessionStatus>();

  for (const [session, content] of current) {
    // Ignore empty pane content (session still starting up)
    if (!content.trim()) {
      result.set(session, "unknown");
      continue;
    }

    if (!previous || !previous.has(session)) {
      result.set(session, "unknown");
      continue;
    }

    const prevContent = previous.get(session)!;
    result.set(session, content === prevContent ? "waiting" : "active");
  }

  return result;
}
