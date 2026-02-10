import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PaginationOrderBy } from "@linear/sdk";
import { linearClient } from "../lib/linear";
import type { EnrichedTask, BlockingIssue, LinearStatusType } from "../types";
import { EXTERNAL_API_REFRESH_INTERVAL } from "../constants/intervals";
import { ORPHAN_PROJECT_ID } from "../stores/projectStore";

export type LinearConnectionStatus =
  | { status: "no-token" }
  | { status: "no-teams" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "connected" };

export function useLinearConnectionStatus(
  teamIds: string[],
  isLoading: boolean,
  error: Error | null,
): LinearConnectionStatus {
  return useMemo(() => {
    if (!linearClient) return { status: "no-token" as const };
    if (teamIds.length === 0) return { status: "no-teams" as const };
    if (isLoading) return { status: "loading" as const };
    if (error) return { status: "error" as const, message: error.message };
    return { status: "connected" as const };
  }, [teamIds.length, isLoading, error]);
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

export interface LinearProject {
  id: string;
  name: string;
}

export function useLinearMyProjects() {
  return useQuery<LinearProject[]>({
    queryKey: ["linear", "my-projects"],
    queryFn: async () => {
      if (!linearClient) return [];

      const result = await linearClient.projects({
        filter: {
          members: { some: { isMe: { eq: true } } },
          status: { type: { eq: "started" } },
        },
        orderBy: PaginationOrderBy.CreatedAt,
        first: 100,
      });

      return result.nodes.map((p) => ({ id: p.id, name: p.name }));
    },
    enabled: !!linearClient,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}

export function useLinearProjectIssues(
  projectId: string | null,
  teamIds: string[],
) {
  return useQuery<EnrichedTask[]>({
    queryKey: ["linear", "project-issues", projectId, teamIds],
    queryFn: async () => {
      if (
        !linearClient ||
        !projectId ||
        projectId === ORPHAN_PROJECT_ID ||
        teamIds.length === 0
      )
        return [];

      const resolvedIds = await resolveTeamIds(teamIds);
      const me = await linearClient.viewer;
      const viewerId = me.id;

      const issues = await linearClient.issues({
        filter: {
          project: { id: { eq: projectId } },
          team: { id: { in: resolvedIds } },
          state: { type: { in: ["triage", "unstarted", "started"] } },
        },
        first: 250,
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
                relationId: relation.id,
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
            linearStatusType: (state?.type as LinearStatusType) ?? null,
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
            isAssignedToMe: assignee?.id === viewerId,
            assigneeName: assignee?.displayName ?? assignee?.name ?? null,
          };
        }),
      );

      return tasks;
    },
    enabled:
      !!linearClient &&
      !!projectId &&
      projectId !== ORPHAN_PROJECT_ID &&
      teamIds.length > 0,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}

export interface LinearIssueStub {
  id: string;
  identifier: string;
  title: string;
  url: string;
  status: string;
  statusType: LinearStatusType | null;
}

export function useLinearMyActiveIdentifiers(teamIds: string[]) {
  return useQuery<Set<string>>({
    queryKey: ["linear", "my-active-identifiers", teamIds],
    queryFn: async () => {
      if (!linearClient || teamIds.length === 0) return new Set();
      const resolvedIds = await resolveTeamIds(teamIds);
      const issues = await linearClient.issues({
        filter: {
          assignee: { isMe: { eq: true } },
          team: { id: { in: resolvedIds } },
          state: { type: { in: ["triage", "unstarted", "started"] } },
        },
        first: 500,
      });
      return new Set(issues.nodes.map((i) => i.identifier.toLowerCase()));
    },
    enabled: !!linearClient && teamIds.length > 0,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}

export function useLinearIssuesByBranches(branchNames: string[]) {
  return useQuery<Map<string, LinearIssueStub>>({
    queryKey: ["linear", "issues-by-branches", branchNames],
    queryFn: async () => {
      if (!linearClient || branchNames.length === 0) return new Map();
      const map = new Map<string, LinearIssueStub>();
      await Promise.allSettled(
        branchNames.map(async (branch) => {
          const issue = await linearClient!.issueVcsBranchSearch(branch);
          if (!issue) return;
          const state = await issue.state;
          map.set(branch.toLowerCase(), {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            url: issue.url,
            status: state?.name ?? "Unknown",
            statusType: (state?.type as LinearStatusType) ?? null,
          });
        }),
      );
      return map;
    },
    enabled: !!linearClient && branchNames.length > 0,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}
