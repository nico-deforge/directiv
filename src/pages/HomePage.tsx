import { ProjectSelector } from "../components/Layout/ProjectSelector";
import { DependencyGraph } from "../components/Board/DependencyGraph";
import { useProjectsSync } from "../hooks/useProjectsSync";

export function HomePage() {
  useProjectsSync();

  return (
    <div className="flex h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <ProjectSelector />
      <main className="flex-1 h-full">
        <DependencyGraph />
      </main>
    </div>
  );
}
