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

      const tasks: EnrichedTask[] = [];
      for (const issue of issues.nodes) {
        const state = await issue.state;
        const assignee = await issue.assignee;
        const project = await issue.project;

        tasks.push({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description ?? null,
          priority: issue.priority,
          status: state?.name ?? "Unknown",
          assigneeId: assignee?.id ?? null,
          projectId: project?.id ?? null,
          projectName: project?.name ?? null,
          labels: [],
          column: "backlog" as const,
          session: null,
          worktree: null,
          pullRequest: null,
          url: issue.url,
        });
      }

      return tasks;
    },
    enabled: !!linearClient && !!teamId,
    refetchInterval: 30_000,
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTeamIds(keys: string[]): Promise<string[]> {
  if (!linearClient) return [];

  // If all values are already UUIDs, return as-is
  if (keys.every((k) => UUID_RE.test(k))) return keys;

  const teams = await linearClient.teams();
  return keys.map((key) => {
    if (UUID_RE.test(key)) return key;
    const team = teams.nodes.find((t) => t.key === key);
    if (!team) throw new Error(`Team key "${key}" not found in Linear`);
    return team.id;
  });
}

export function useLinearAllMyTasks(teamIds: string[]) {
  return useQuery<EnrichedTask[]>({
    queryKey: ["linear", "all-my-tasks", teamIds],
    queryFn: async () => {
      if (!linearClient || teamIds.length === 0) return [];

      const resolvedIds = await resolveTeamIds(teamIds);
      const me = await linearClient.viewer;
      const issues = await me.assignedIssues({
        filter: {
          team: { id: { in: resolvedIds } },
          state: { type: { nin: ["canceled", "completed"] } },
        },
      });

      const tasks: EnrichedTask[] = [];
      for (const issue of issues.nodes) {
        const state = await issue.state;
        const assignee = await issue.assignee;
        const project = await issue.project;

        tasks.push({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description ?? null,
          priority: issue.priority,
          status: state?.name ?? "Unknown",
          assigneeId: assignee?.id ?? null,
          projectId: project?.id ?? null,
          projectName: project?.name ?? null,
          labels: [],
          column: "backlog" as const,
          session: null,
          worktree: null,
          pullRequest: null,
          url: issue.url,
        });
      }

      return tasks;
    },
    enabled: !!linearClient && teamIds.length > 0,
    refetchInterval: 30_000,
  });
}
