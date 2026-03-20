import { PaginationOrderBy } from "@linear/sdk";
import { useQuery } from "@tanstack/react-query";
import { EXTERNAL_API_REFRESH_INTERVAL } from "../constants/intervals";
import { getLinearClient } from "../lib/linear";
import { useAuthStore, AUTH_PROVIDER_STATUS } from "../stores/authStore";
import {
  ORPHAN_PROJECT_ID,
  OTHER_ISSUES_PROJECT_ID,
} from "../stores/projectStore";
import type { BlockingIssue, EnrichedTask, LinearStatusType } from "../types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function useIsLinearConnected() {
  return useAuthStore((s) => s.linearStatus === AUTH_PROVIDER_STATUS.CONNECTED);
}

async function resolveTeamIds(keys: string[]): Promise<string[]> {
  const client = getLinearClient();
  if (!client) return [];

  if (keys.every((k) => UUID_RE.test(k))) return keys;

  const me = await client.viewer;
  const teams = await me.teams();
  return keys.map((key) => {
    if (UUID_RE.test(key)) return key;
    const team = teams.nodes.find((t) => t.key === key);
    if (!team) throw new Error(`Team key "${key}" not found in Linear`);
    return team.id;
  });
}

async function mapIssueToEnrichedTask(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  issue: any,
  viewerId: string,
): Promise<EnrichedTask> {
  const [state, assignee, project, inverseRelations] = await Promise.all([
    issue.state,
    issue.assignee,
    issue.project,
    issue.inverseRelations(),
  ]);

  const blockingRelations = inverseRelations.nodes.filter(
    (r: { type: string }) => r.type === "blocks",
  );

  const blockedBy: BlockingIssue[] = await Promise.all(
    blockingRelations.map(
      async (relation: {
        issue: Promise<{
          id: string;
          identifier: string;
          title: string;
          url: string;
        } | null>;
        id: string;
      }) => {
        const blockingIssue = await relation.issue;
        if (!blockingIssue) return null;
        return {
          id: blockingIssue.id,
          identifier: blockingIssue.identifier,
          title: blockingIssue.title,
          url: blockingIssue.url,
          relationId: relation.id,
        };
      },
    ),
  ).then((results) => results.filter((r): r is BlockingIssue => r !== null));

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
}

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

export interface LinearTeam {
  id: string;
  name: string;
  displayName: string;
  key: string;
}

export function useLinearTeams() {
  const isConnected = useIsLinearConnected();
  return useQuery<LinearTeam[]>({
    queryKey: ["linear", "teams"],
    queryFn: async () => {
      const client = getLinearClient();
      if (!client) return [];
      const me = await client.viewer;
      const result = await me.teams();
      return result.nodes.map((t) => ({
        id: t.id,
        name: t.name,
        displayName: t.displayName,
        key: t.key,
      }));
    },
    enabled: isConnected,
    staleTime: 5 * 60 * 1000,
  });
}

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
        first: 100,
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

export function useLinearProjectIssues(
  projectId: string | null,
  teamIds: string[],
) {
  const isConnected = useIsLinearConnected();

  return useQuery<EnrichedTask[]>({
    queryKey: ["linear", "project-issues", projectId, teamIds],
    queryFn: async () => {
      const client = getLinearClient();
      if (
        !client ||
        !projectId ||
        projectId === ORPHAN_PROJECT_ID ||
        projectId === OTHER_ISSUES_PROJECT_ID ||
        teamIds.length === 0
      )
        return [];

      const resolvedIds = await resolveTeamIds(teamIds);
      const me = await client.viewer;
      const viewerId = me.id;

      const issues = await client.issues({
        filter: {
          project: { id: { eq: projectId } },
          team: { id: { in: resolvedIds } },
          state: { type: { in: ["triage", "unstarted", "started"] } },
        },
        first: 250,
      });

      const results = await Promise.allSettled(
        issues.nodes.map((issue) => mapIssueToEnrichedTask(issue, viewerId)),
      );
      return results
        .filter(
          (r): r is PromiseFulfilledResult<EnrichedTask> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value);
    },
    enabled:
      isConnected &&
      !!projectId &&
      projectId !== ORPHAN_PROJECT_ID &&
      projectId !== OTHER_ISSUES_PROJECT_ID &&
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

export function useLinearMyActiveIdentifiers() {
  const isConnected = useIsLinearConnected();

  return useQuery<Set<string>>({
    queryKey: ["linear", "my-active-identifiers"],
    queryFn: async () => {
      const client = getLinearClient();
      if (!client) return new Set();
      const issues = await client.issues({
        filter: {
          assignee: { isMe: { eq: true } },
          state: { type: { in: ["triage", "unstarted", "started"] } },
        },
        first: 500,
      });
      return new Set(issues.nodes.map((i) => i.identifier.toLowerCase()));
    },
    enabled: isConnected,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}

export function useLinearOtherIssues(memberProjectIds: string[] | undefined) {
  const isConnected = useIsLinearConnected();
  const hasProjects = memberProjectIds !== undefined;

  return useQuery<EnrichedTask[]>({
    queryKey: ["linear", "other-issues", memberProjectIds ?? []],
    queryFn: async () => {
      const client = getLinearClient();
      if (!client || !memberProjectIds) return [];

      const me = await client.viewer;
      const viewerId = me.id;

      const issues = await client.issues({
        filter: {
          assignee: { isMe: { eq: true } },
          state: { type: { in: ["triage", "unstarted", "started"] } },
        },
        first: 250,
      });

      // Filter before expensive mapping: keep issues with no project or project not in member list
      const memberSet = new Set(memberProjectIds);
      const filtered = issues.nodes.filter((issue) => {
        const projId = issue.projectId;
        return !projId || !memberSet.has(projId);
      });

      const results = await Promise.allSettled(
        filtered.map((issue) => mapIssueToEnrichedTask(issue, viewerId)),
      );
      return results
        .filter(
          (r): r is PromiseFulfilledResult<EnrichedTask> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value);
    },
    enabled: isConnected && hasProjects,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}

export function useLinearIssuesByBranches(branchNames: string[]) {
  const isConnected = useIsLinearConnected();

  return useQuery<Map<string, LinearIssueStub>>({
    queryKey: ["linear", "issues-by-branches", branchNames],
    queryFn: async () => {
      const client = getLinearClient();
      if (!client || branchNames.length === 0) return new Map();
      const map = new Map<string, LinearIssueStub>();
      await Promise.allSettled(
        branchNames.map(async (branch) => {
          const issue = await client.issueVcsBranchSearch(branch);
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
    enabled: isConnected && branchNames.length > 0,
    refetchInterval: EXTERNAL_API_REFRESH_INTERVAL,
  });
}
