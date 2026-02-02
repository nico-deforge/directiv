import { useEffect } from "react";
import { Sidebar } from "./components/Layout/Sidebar";
import { WorkflowBoard } from "./components/Board/WorkflowBoard";
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
      <main className="flex-1 h-full">
        <WorkflowBoard />
      </main>
      <WorktreePanel />
    </div>
  );
}

export default App;
