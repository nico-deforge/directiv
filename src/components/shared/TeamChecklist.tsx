import type { LinearTeam } from "../../hooks/useLinear";

export function TeamChecklist({
  teams,
  selectedKeys,
  onToggle,
}: {
  teams: LinearTeam[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="space-y-2">
      {teams.map((team) => {
        const isSelected = selectedKeys.includes(team.key);
        return (
          <button
            key={team.id}
            onClick={() => onToggle(team.key)}
            className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
              isSelected
                ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10"
                : "border-[var(--border-default)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)]"
            }`}
          >
            <div
              className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                isSelected
                  ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]"
                  : "border-[var(--border-default)]"
              }`}
            >
              {isSelected && (
                <svg
                  viewBox="0 0 12 12"
                  className="size-3 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {team.displayName}
              </span>
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                {team.key}
              </span>
            </div>
          </button>
        );
      })}

      {teams.length === 0 && (
        <p className="py-4 text-center text-sm text-[var(--text-muted)]">
          No teams found in your Linear workspace.
        </p>
      )}
    </div>
  );
}
