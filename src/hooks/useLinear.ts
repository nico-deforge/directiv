import { useQuery } from "@tanstack/react-query";
import { linearClient } from "../lib/linear";
import type { EnrichedTask } from "../types";

export function useLinearMyTasks(teamId: string | undefined) {
  return useQuery<EnrichedTask[]>({
    queryKey: ["linear", "my-tasks", teamId],
    queryFn: async () => {
      if (!linearClient || !teamId) return [];

      const me = await linearClient.viewer;
      const issues = await me.assignedIssues({
        filter: {
          team: { id: { eq: teamId } },
          state: { type: { nin: ["canceled", "completed"] } },
        },
      });

      return issues.nodes.map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? null,
        priority: issue.priority,
        status: issue.state?.then((s) => s.name) as unknown as string,
        assigneeId: issue.assignee?.then((a) => a.id) as unknown as
          | string
          | null,
        labels: [],
        column: "backlog" as const,
        session: null,
        worktree: null,
        pullRequest: null,
        url: issue.url,
      }));
    },
    enabled: !!linearClient && !!teamId,
    refetchInterval: 30_000,
  });
}
