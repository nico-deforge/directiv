import { useState, useCallback } from "react";
import { ProjectSelector } from "../components/Layout/ProjectSelector";
import { DependencyGraph } from "../components/Board/DependencyGraph";
import type { Project } from "../stores/projectStore";

export function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [hasOrphans, setHasOrphans] = useState(false);

  const handleProjectsChange = useCallback(
    (newProjects: Project[], orphans: boolean) => {
      setProjects(newProjects);
      setHasOrphans(orphans);
    },
    [],
  );

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <ProjectSelector projects={projects} hasOrphans={hasOrphans} />
      <main className="flex-1 h-full">
        <DependencyGraph onProjectsChange={handleProjectsChange} />
      </main>
    </div>
  );
}
