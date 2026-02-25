import { useEffect, useMemo } from "react";
import {
  useLinearMyProjects,
  useLinearProjectIssues,
  useLinearConnectionStatus,
  useLinearMyActiveIdentifiers,
} from "./useLinear";
import { useAllWorktrees } from "./useWorktrees";
import { useSettingsStore } from "../stores/settingsStore";
import { useWorkspaceRepos } from "./useWorkspace";
import { useProjectStore, type Project } from "../stores/projectStore";

/**
 * Syncs project-related query results into the project Zustand store.
 * Call once in HomePage. TanStack Query deduplicates identical calls
 * made by DependencyGraph.
 */
export function useProjectsSync() {
  const teamIds = useSettingsStore((s) => s.config.linear.teamIds);
  const repos = useWorkspaceRepos();
  const setProjectsData = useProjectStore((s) => s.setProjectsData);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);

  const {
    data: linearProjects,
    isLoading: projectsLoading,
    error: projectsError,
  } = useLinearMyProjects();

  const { isLoading: tasksLoading, error: tasksError } = useLinearProjectIssues(
    selectedProjectId,
    teamIds,
  );

  const connectionStatus = useLinearConnectionStatus(
    teamIds,
    projectsLoading || tasksLoading,
    projectsError || tasksError,
  );

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
