import { useState, useCallback } from "react";
import { ProjectSelector } from "../components/Layout/ProjectSelector";
import { DependencyGraph } from "../components/Board/DependencyGraph";
import type { Project } from "../stores/projectStore";
import type { LinearConnectionStatus } from "../hooks/useLinear";

export function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [hasOrphans, setHasOrphans] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<LinearConnectionStatus>({ status: "loading" });

  const handleProjectsChange = useCallback(
    (
      newProjects: Project[],
      orphans: boolean,
      status: LinearConnectionStatus,
    ) => {
      setProjects(newProjects);
      setHasOrphans(orphans);
      setConnectionStatus(status);
    },
    [],
  );

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <ProjectSelector
        projects={projects}
        hasOrphans={hasOrphans}
        connectionStatus={connectionStatus}
      />
      <main className="flex-1 h-full">
        <DependencyGraph onProjectsChange={handleProjectsChange} />
      </main>
    </div>
  );
}
