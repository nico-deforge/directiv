import { useEffect, useMemo } from "react";
import {
  useLinearMyProjects,
  useLinearProjectIssues,
  useLinearMyActiveIdentifiers,
  useLinearOtherIssues,
} from "./useLinear";
import { useCurrentLinearTeamIds } from "./useLinearConfig";
import { useAllWorktrees } from "./useWorktrees";
import { useAuthStore, AUTH_PROVIDER_STATUS } from "../stores/authStore";
import { useWorkspaceRepos } from "./useWorkspace";
import {
  useProjectStore,
  OTHER_ISSUES_PROJECT_ID,
  type Project,
} from "../stores/projectStore";
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

  const memberProjectIds = useMemo(
    () => linearProjects?.map((p) => p.id),
    [linearProjects],
  );

  const {
    data: otherIssues,
    isLoading: otherLoading,
    error: otherError,
  } = useLinearOtherIssues(memberProjectIds);

  const isOtherSelected = selectedProjectId === OTHER_ISSUES_PROJECT_ID;

  const connectionStatus: LinearConnectionStatus = useMemo(() => {
    if (linearStatus !== AUTH_PROVIDER_STATUS.CONNECTED)
      return { status: "loading" as const };
    if (teamIds.length === 0 && !isOtherSelected)
      return { status: "no-teams" as const };
    const loading = isOtherSelected
      ? projectsLoading || otherLoading
      : projectsLoading || tasksLoading;
    const error = projectsError || tasksError || otherError;
    if (loading) return { status: "loading" as const };
    if (error) return { status: "error" as const, message: error.message };
    return { status: "connected" as const };
  }, [
    linearStatus,
    teamIds.length,
    isOtherSelected,
    projectsLoading,
    tasksLoading,
    otherLoading,
    projectsError,
    tasksError,
    otherError,
  ]);

  const { data: allWorktrees } = useAllWorktrees(repos);
  const { data: myActiveIdentifiers, isSuccess: identifiersLoaded } =
    useLinearMyActiveIdentifiers();

  const projectList = useMemo(() => {
    if (!linearProjects) return [];
    return linearProjects.map(
      (p): Project => ({
        id: p.id,
        name: p.name,
        statusType: p.statusType,
        url: p.url,
      }),
    );
  }, [linearProjects]);

  const orphanCount = useMemo(() => {
    if (!identifiersLoaded) return 0;
    const knownIdentifiers = myActiveIdentifiers ?? new Set<string>();
    return (allWorktrees ?? []).reduce(
      (count, rw) =>
        count +
        rw.worktrees
          .slice(1)
          .filter((wt) => !knownIdentifiers.has(wt.branch.toLowerCase()))
          .length,
      0,
    );
  }, [identifiersLoaded, myActiveIdentifiers, allWorktrees]);

  const otherIssuesCount = (otherIssues ?? []).length;

  useEffect(() => {
    setProjectsData({
      projects: projectList,
      orphanCount,
      otherIssuesCount,
      connectionStatus,
    });
  }, [
    projectList,
    orphanCount,
    otherIssuesCount,
    connectionStatus,
    setProjectsData,
  ]);
}
