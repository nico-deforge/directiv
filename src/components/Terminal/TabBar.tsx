import { LayoutGrid, X, Terminal, AlertTriangle } from "lucide-react";
import { useTerminalStore } from "../../stores/terminalStore";
import { useClaudeSessionStates } from "../../hooks/useTmux";

export function TabBar() {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTab = useTerminalStore((s) => s.activeTab);
  const focusTab = useTerminalStore((s) => s.focusTab);
  const closeTerminal = useTerminalStore((s) => s.closeTerminal);

  const tabSessionNames = tabs.map((t) => t.sessionName);
  const { data: claudeStates } = useClaudeSessionStates(tabSessionNames);

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--border-default)] bg-[var(--bg-secondary)] px-1">
      {/* Board tab — always present, not closable */}
      <button
        onClick={() => focusTab("board")}
        className={`relative flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-xs font-medium tracking-wide transition-colors ${
          activeTab === "board"
            ? "text-[var(--accent-cyan)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        }`}
      >
        <LayoutGrid className="size-3.5" />
        Board
        {activeTab === "board" && (
          <div className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-[var(--accent-cyan)]" />
        )}
      </button>

      {/* Terminal tabs */}
      {tabs.map((tab) => {
        const isWaiting = claudeStates?.get(tab.sessionName) === "waiting";
        const isActive = activeTab === tab.sessionName;

        return (
          <div
            key={tab.sessionName}
            className={`group relative flex items-center gap-1 rounded px-2.5 py-1.5 font-mono text-xs font-medium tracking-wide transition-colors ${
              isActive
                ? "text-[var(--text-primary)]"
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
              {isWaiting && (
                <AlertTriangle className="size-3 animate-[pulse-glow_2s_ease-in-out_infinite] text-[var(--accent-red)]" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTerminal(tab.sessionName);
              }}
              className="ml-1 rounded p-0.5 opacity-0 transition-all duration-150 hover:bg-[var(--accent-red)]/20 hover:text-[var(--accent-red)] group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
            {isActive && (
              <div className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-[var(--accent-cyan)]" />
            )}
          </div>
        );
      })}
    </div>
  );
}
