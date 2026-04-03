import { PaginationOrderBy } from "@linear/sdk";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  EXTERNAL_API_REFRESH_INTERVAL,
  LINEAR_FETCH_LIMIT,
} from "../constants/intervals";
import { getLinearClient } from "../lib/linear";
import { linearQuery } from "../lib/linearGraphQL";
import {
  VIEWER_WITH_TEAMS,
  ISSUES_ENRICHED,
  BRANCH_SEARCH,
} from "../lib/linearQueries";
import type {
  ViewerWithTeamsData,
  IssuesEnrichedData,
  IssueNode,
  BranchSearchData,
  TeamNode,
  WorkflowStateNode,
} from "../lib/linearQueries";
import { transformIssueNode } from "../lib/linearTransform";
import { useAuthStore, AUTH_PROVIDER_STATUS } from "../stores/authStore";
import {
  ORPHAN_PROJECT_ID,
  OTHER_ISSUES_PROJECT_ID,
} from "../stores/projectStore";
import { LINEAR_STATUS_TYPES } from "../types";
import type { EnrichedTask, LinearStatusType } from "../types";

// ---------------------------------------------------------------------------
// Module-level cache populated by useLinearViewerData
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Team workflow states cache — used by updateLinearStatusToStarted in workflows.ts */
export const teamStatesCache = new Map<string, WorkflowStateNode[]>();

function useIsLinearConnected() {
  return useAuthStore((s) => s.linearStatus === AUTH_PROVIDER_STATUS.CONNECTED);
}

function resolveTeamIdsFromData(keys: string[], teams: TeamNode[]): string[] {
  return keys.map((key) => {
    if (UUID_RE.test(key)) return key;
    const team = teams.find((t) => t.key === key);
    if (!team) throw new Error(`Team key "${key}" not found in Linear`);
    return team.id;
  });
}

// ---------------------------------------------------------------------------
// Hook: Viewer + Teams (single query, 5 min stale)
// ---------------------------------------------------------------------------

export interface LinearTeam {
  id: string;
  name: string;
  displayName: string;
  key: string;
}

interface ViewerData {
  viewerId: string;
  teams: TeamNode[];
}

function useLinearViewerData() {
  const isConnected = useIsLinearConnected();
  return useQuery<ViewerData>({
    queryKey: ["linear", "viewer-data"],
    queryFn: async () => {
      const data = await linearQuery<ViewerWithTeamsData>(VIEWER_WITH_TEAMS);

      // Populate team states cache for imperative use in workflows.ts
      for (const team of data.viewer.teams.nodes) {
        teamStatesCache.set(team.id, team.states.nodes);
      }

      return {
        viewerId: data.viewer.id,
        teams: data.viewer.teams.nodes,
      };
    },
    enabled: isConnected,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLinearTeams() {
  const { data: viewerData, ...rest } = useLinearViewerData();
  const teams = useMemo<LinearTeam[]>(
    () =>
      viewerData?.teams.map((t) => ({
        id: t.id,
        name: t.name,
        displayName: t.displayName,
        key: t.key,
      })) ?? [],
    [viewerData],
  );
  return { data: teams, ...rest };
}

// ---------------------------------------------------------------------------
// Hook: My Projects (single SDK request, no N+1 risk)
// ---------------------------------------------------------------------------

export interface LinearProject {
  id: string;
  name: string;
  statusType: LinearProjectStatusType;
  url: string;
}

export const LINEAR_PROJECT_STATUS_TYPE = {
  STARTED: "started",
  BACKLOG: "backlog",
} as const;

export type LinearProjectStatusType =
  (typeof LINEAR_PROJECT_STATUS_TYPE)[keyof typeof LINEAR_PROJECT_STATUS_TYPE];

export function useLinearMyProjects() {
  const isConnected = useIsLinearConnected();

  return useQuery<LinearProject[]>({
    queryKey: ["linear", "my-projects"],
    queryFn: async () => {
      const client = getLinearClient();
      if (!client) return [];

      const result = await client.projects({
        filter: {
          members: { some: { isMe: { eq: true } } },
          status: { type: { in: ["started", "backlog"] } },
        },
        orderBy: PaginationOrderBy.CreatedAt,
        first: LINEAR_FETCH_LIMIT,
      });

      return result.nodes.map((p) => ({
        id: p.id,
        name: p.name,
        statusType: p.state as LinearProjectStatusType,
        url: p.url,
      }));
    },
    enabled: isConnected,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}

// ---------------------------------------------------------------------------
// Hook: Project Issues (1 GraphQL query replaces N+1 lazy-loaded SDK calls)
// ---------------------------------------------------------------------------

export function useLinearProjectIssues(
  projectId: string | null,
  teamIds: string[],
) {
  const isConnected = useIsLinearConnected();
  const { data: viewerData } = useLinearViewerData();

  return useQuery<EnrichedTask[]>({
    queryKey: ["linear", "project-issues", projectId, teamIds],
    queryFn: async () => {
      const resolvedIds = resolveTeamIdsFromData(teamIds, viewerData!.teams);

      const data = await linearQuery<IssuesEnrichedData>(ISSUES_ENRICHED, {
        filter: {
          project: { id: { eq: projectId } },
          team: { id: { in: resolvedIds } },
          state: {
            type: {
              in: [
                LINEAR_STATUS_TYPES.TRIAGE,
                LINEAR_STATUS_TYPES.TODO,
                LINEAR_STATUS_TYPES.IN_PROGRESS,
                LINEAR_STATUS_TYPES.DONE,
              ],
            },
          },
        },
        first: LINEAR_FETCH_LIMIT,
      });

      return data.issues.nodes.map((node) =>
        transformIssueNode(node, viewerData!.viewerId),
      );
    },
    enabled:
      isConnected &&
      !!viewerData &&
      !!projectId &&
      projectId !== ORPHAN_PROJECT_ID &&
      projectId !== OTHER_ISSUES_PROJECT_ID &&
      teamIds.length > 0,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}

// ---------------------------------------------------------------------------
// Shared internal hook: My Assigned Issues (single query, shared by two hooks)
// ---------------------------------------------------------------------------

interface MyAssignedIssuesResult {
  nodes: IssueNode[];
  viewerId: string;
}

function useLinearMyAssignedIssues() {
  const isConnected = useIsLinearConnected();
  const { data: viewerData } = useLinearViewerData();

  return useQuery<MyAssignedIssuesResult>({
    queryKey: ["linear", "my-assigned-issues"],
    queryFn: async () => {
      const data = await linearQuery<IssuesEnrichedData>(ISSUES_ENRICHED, {
        filter: {
          assignee: { isMe: { eq: true } },
          state: { type: { in: ["triage", "unstarted", "started"] } },
        },
        first: LINEAR_FETCH_LIMIT,
      });

      return { nodes: data.issues.nodes, viewerId: viewerData!.viewerId };
    },
    enabled: isConnected && !!viewerData,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}

// ---------------------------------------------------------------------------
// Hook: My Active Identifiers (derived from shared query — 0 extra requests)
// ---------------------------------------------------------------------------

export function useLinearMyActiveIdentifiers() {
  const queryResult = useLinearMyAssignedIssues();

  const identifiers = useMemo(() => {
    if (!queryResult.data) return new Set<string>();
    return new Set(
      queryResult.data.nodes.map((n) => n.identifier.toLowerCase()),
    );
  }, [queryResult.data]);

  return { ...queryResult, data: identifiers };
}

// ---------------------------------------------------------------------------
// Hook: Other Issues (derived from shared query — 0 extra requests)
// ---------------------------------------------------------------------------

export function useLinearOtherIssues(memberProjectIds: string[] | undefined) {
  const queryResult = useLinearMyAssignedIssues();

  const otherIssues = useMemo(() => {
    if (!queryResult.data || !memberProjectIds) return undefined;
    const memberSet = new Set(memberProjectIds);
    return queryResult.data.nodes
      .filter((n) => !n.project?.id || !memberSet.has(n.project.id))
      .map((n) => transformIssueNode(n, queryResult.data!.viewerId));
  }, [queryResult.data, memberProjectIds]);

  return { ...queryResult, data: otherIssues };
}

// ---------------------------------------------------------------------------
// Hook: Issues by Branches (1 GraphQL request per branch)
// ---------------------------------------------------------------------------

export interface LinearIssueStub {
  id: string;
  identifier: string;
  title: string;
  url: string;
  status: string;
  statusType: LinearStatusType | null;
  statusColor: string | null;
}

export function useLinearIssuesByBranches(branchNames: string[]) {
  const isConnected = useIsLinearConnected();

  return useQuery<Map<string, LinearIssueStub>>({
    queryKey: ["linear", "issues-by-branches", branchNames],
    queryFn: async () => {
      if (branchNames.length === 0) return new Map();
      const map = new Map<string, LinearIssueStub>();
      const results = await Promise.allSettled(
        branchNames.map(async (branch) => {
          const data = await linearQuery<BranchSearchData>(BRANCH_SEARCH, {
            branchName: branch,
          });
          const issue = data.issueVcsBranchSearch;
          if (!issue) return;
          map.set(branch.toLowerCase(), {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            url: issue.url,
            status: issue.state?.name ?? "Unknown",
            statusType: (issue.state?.type as LinearStatusType) ?? null,
            statusColor: issue.state?.color ?? null,
          });
        }),
      );
      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (failures.length > 0) {
        console.warn(
          `[useLinearIssuesByBranches] ${failures.length}/${branchNames.length} lookups failed`,
        );
      }
      return map;
    },
    enabled: isConnected && branchNames.length > 0,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}
