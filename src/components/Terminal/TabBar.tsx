import { LayoutGrid, X, Terminal } from "lucide-react";
import { useTerminalStore } from "../../stores/terminalStore";

export function TabBar() {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTab = useTerminalStore((s) => s.activeTab);
  const focusTab = useTerminalStore((s) => s.focusTab);
  const closeTerminal = useTerminalStore((s) => s.closeTerminal);

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--border-default)] bg-[var(--bg-secondary)] px-1">
      {/* Board tab — always present, not closable */}
      <button
        onClick={() => focusTab("board")}
        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          activeTab === "board"
            ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        }`}
      >
        <LayoutGrid className="size-3.5" />
        Board
      </button>

      {/* Terminal tabs */}
      {tabs.map((tab) => (
        <div
          key={tab.sessionName}
          className={`group flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            activeTab === tab.sessionName
              ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          <button
            onClick={() => focusTab(tab.sessionName)}
            className="flex items-center gap-1.5"
          >
            <Terminal className="size-3.5" />
            <span className="max-w-40 truncate">
              {tab.identifier}: {tab.title}
            </span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeTerminal(tab.sessionName);
            }}
            className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-[var(--bg-elevated)] group-hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
