import { useEffect, useMemo } from "react";
import {
  useLinearMyProjects,
  useLinearProjectIssues,
  useLinearMyActiveIdentifiers,
} from "./useLinear";
import { useCurrentLinearTeamIds } from "./useLinearConfig";
import { useAllWorktrees } from "./useWorktrees";
import { useAuthStore, AUTH_PROVIDER_STATUS } from "../stores/authStore";
import { useWorkspaceRepos } from "./useWorkspace";
import { useProjectStore, type Project } from "../stores/projectStore";
import type { LinearConnectionStatus } from "../stores/projectStore";

/**
 * Syncs project-related query results into the project Zustand store.
 * Call once in HomePage. TanStack Query deduplicates identical calls
 * made by DependencyGraph.
 */
export function useProjectsSync() {
  const teamIds = useCurrentLinearTeamIds();
  const repos = useWorkspaceRepos();
  const setProjectsData = useProjectStore((s) => s.setProjectsData);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const linearStatus = useAuthStore((s) => s.linearStatus);

  const {
    data: linearProjects,
    isLoading: projectsLoading,
    error: projectsError,
  } = useLinearMyProjects();

  const { isLoading: tasksLoading, error: tasksError } = useLinearProjectIssues(
    selectedProjectId,
    teamIds,
  );

  const connectionStatus: LinearConnectionStatus = useMemo(() => {
    if (linearStatus !== AUTH_PROVIDER_STATUS.CONNECTED)
      return { status: "loading" as const };
    if (teamIds.length === 0) return { status: "no-teams" as const };
    if (projectsLoading || tasksLoading) return { status: "loading" as const };
    if (projectsError || tasksError)
      return {
        status: "error" as const,
        message: (projectsError || tasksError)!.message,
      };
    return { status: "connected" as const };
  }, [
    linearStatus,
    teamIds.length,
    projectsLoading,
    tasksLoading,
    projectsError,
    tasksError,
  ]);

  const { data: allWorktrees } = useAllWorktrees(repos);
  const { data: myActiveIdentifiers } = useLinearMyActiveIdentifiers(teamIds);

  const projectList = useMemo(() => {
    if (!linearProjects) return [];
    return linearProjects.map(
      (p): Project => ({
        id: p.id,
        name: p.name,
        statusType: p.statusType,
      }),
    );
  }, [linearProjects]);

  const hasOrphans = useMemo(() => {
    const knownIdentifiers = myActiveIdentifiers ?? new Set<string>();
    return (allWorktrees ?? []).some((rw) =>
      rw.worktrees
        .slice(1)
        .some((wt) => !knownIdentifiers.has(wt.branch.toLowerCase())),
    );
  }, [myActiveIdentifiers, allWorktrees]);

  useEffect(() => {
    setProjectsData(projectList, hasOrphans, connectionStatus);
  }, [projectList, hasOrphans, connectionStatus, setProjectsData]);
}
