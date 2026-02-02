import { useEffect } from "react";
import { Sidebar } from "./components/Layout/Sidebar";
import { WorktreePanel } from "./components/Worktrees/WorktreePanel";
import { useSettingsStore } from "./stores/settingsStore";

function App() {
  const loadFromDisk = useSettingsStore((s) => s.loadFromDisk);
  const isLoaded = useSettingsStore((s) => s.isLoaded);

  useEffect(() => {
    loadFromDisk();
  }, [loadFromDisk]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <Sidebar />
      <main className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Workflow board — coming soon</p>
      </main>
      <WorktreePanel />
    </div>
  );
}

export default App;
