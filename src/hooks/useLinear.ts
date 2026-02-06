import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { linearClient } from "../lib/linear";
import type { EnrichedTask, BlockingIssue } from "../types";
import { EXTERNAL_API_REFRESH_INTERVAL } from "../constants/intervals";

export type LinearConnectionStatus =
  | { status: "no-token" }
  | { status: "no-teams" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "connected" };

export function useLinearConnectionStatus(
  teamIds: string[],
  isLoading: boolean,
  error: Error | null
): LinearConnectionStatus {
  return useMemo(() => {
    if (!linearClient) return { status: "no-token" as const };
    if (teamIds.length === 0) return { status: "no-teams" as const };
    if (isLoading) return { status: "loading" as const };
    if (error) return { status: "error" as const, message: error.message };
    return { status: "connected" as const };
  }, [teamIds.length, isLoading, error]);
}

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

      const tasks: EnrichedTask[] = await Promise.all(
        issues.nodes.map(async (issue) => {
          const [state, assignee, project, inverseRelations] =
            await Promise.all([
              issue.state,
              issue.assignee,
              issue.project,
              issue.inverseRelations(),
            ]);

          const blockingRelations = inverseRelations.nodes.filter(
            (r) => r.type === "blocks",
          );

          const blockedBy: BlockingIssue[] = await Promise.all(
            blockingRelations.map(async (relation) => {
              const blockingIssue = await relation.issue;
              if (!blockingIssue) return null;
              return {
                id: blockingIssue.id,
                identifier: blockingIssue.identifier,
                title: blockingIssue.title,
                url: blockingIssue.url,
              };
            }),
          ).then((results) =>
            results.filter((r): r is BlockingIssue => r !== null),
          );

          const isBlocked = blockedBy.length > 0;

          return {
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
            isBlocked,
            blockedBy,
          };
        }),
      );

      return tasks;
    },
    enabled: !!linearClient && !!teamId,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
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

      const tasks: EnrichedTask[] = await Promise.all(
        issues.nodes.map(async (issue) => {
          const [state, assignee, project, inverseRelations] =
            await Promise.all([
              issue.state,
              issue.assignee,
              issue.project,
              issue.inverseRelations(),
            ]);

          const blockingRelations = inverseRelations.nodes.filter(
            (r) => r.type === "blocks",
          );

          const blockedBy: BlockingIssue[] = await Promise.all(
            blockingRelations.map(async (relation) => {
              const blockingIssue = await relation.issue;
              if (!blockingIssue) return null;
              return {
                id: blockingIssue.id,
                identifier: blockingIssue.identifier,
                title: blockingIssue.title,
                url: blockingIssue.url,
              };
            }),
          ).then((results) =>
            results.filter((r): r is BlockingIssue => r !== null),
          );

          const isBlocked = blockedBy.length > 0;

          return {
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
            isBlocked,
            blockedBy,
          };
        }),
      );

      return tasks;
    },
    enabled: !!linearClient && teamIds.length > 0,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}
