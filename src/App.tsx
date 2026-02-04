import { useEffect, useState, useCallback } from "react";
import { Toaster } from "sonner";
import { ProjectSelector } from "./components/Layout/ProjectSelector";
import { DependencyGraph } from "./components/Board/DependencyGraph";
import { useSettingsStore } from "./stores/settingsStore";
import type { Project } from "./stores/projectStore";

function App() {
  const loadFromDisk = useSettingsStore((s) => s.loadFromDisk);
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);

  const [projects, setProjects] = useState<Project[]>([]);
  const [hasOrphans, setHasOrphans] = useState(false);

  const handleProjectsChange = useCallback(
    (newProjects: Project[], orphans: boolean) => {
      setProjects(newProjects);
      setHasOrphans(orphans);
    },
    [],
  );

  useEffect(() => {
    loadFromDisk();
  }, [loadFromDisk]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)] text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Toaster theme={resolvedTheme} richColors position="bottom-right" />
      <ProjectSelector projects={projects} hasOrphans={hasOrphans} />
      <main className="flex-1 h-full">
        <DependencyGraph onProjectsChange={handleProjectsChange} />
      </main>
    </div>
  );
}

export default App;
