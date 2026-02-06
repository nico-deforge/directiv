import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useWorkspaceSelector } from "../../hooks/useWorkspace";

export function WorkspaceSelector() {
  const { workspaces, activeId, setActiveWorkspace, showSelector } =
    useWorkspaceSelector();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeWorkspace = workspaces.find((ws) => ws.id === activeId);
  const displayName = activeWorkspace?.name ?? activeWorkspace?.id ?? "Select workspace";

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (!showSelector) {
    return null;
  }

  return (
    <div
      className="relative shrink-0 border-b border-[var(--border-default)] px-3 py-2"
      ref={dropdownRef}
    >
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-1 rounded px-2 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
      >
        {displayName}
        <ChevronDown className="size-3 text-[var(--text-muted)]" />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-40 rounded-md border border-[var(--border-default)] bg-[var(--bg-tertiary)] py-1 shadow-lg">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => {
                setActiveWorkspace(ws.id);
                setIsOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--bg-elevated)] ${
                ws.id === activeId
                  ? "text-[var(--accent-blue)]"
                  : "text-[var(--text-primary)]"
              }`}
            >
              {ws.name ?? ws.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
