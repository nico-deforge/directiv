import { Loader2, AlertCircle } from "lucide-react";
import { useLinearTeams } from "../../../hooks/useLinear";

export function LinearTeamsStep({
  selectedKeys,
  onChange,
}: {
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
}) {
  const { data: teams, isLoading, error } = useLinearTeams();

  function toggleTeam(key: string) {
    if (selectedKeys.includes(key)) {
      onChange(selectedKeys.filter((k) => k !== key));
    } else {
      onChange([...selectedKeys, key]);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Select your Linear teams
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Choose which teams to show on the board.
          </p>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-[var(--text-muted)]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Select your Linear teams
          </h2>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10 p-4">
          <AlertCircle className="size-4 shrink-0 text-[var(--accent-red)]" />
          <p className="text-sm text-[var(--accent-red)]">
            Failed to load teams: {error.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Select your Linear teams
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Choose which teams to show on the board.
        </p>
      </div>

      <div className="space-y-2">
        {teams?.map((team) => {
          const isSelected = selectedKeys.includes(team.key);
          return (
            <button
              key={team.id}
              onClick={() => toggleTeam(team.key)}
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
                  {team.name}
                </span>
                <span className="ml-2 text-xs text-[var(--text-muted)]">
                  {team.key}
                </span>
              </div>
            </button>
          );
        })}

        {teams?.length === 0 && (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">
            No teams found in your Linear workspace.
          </p>
        )}
      </div>
    </div>
  );
}
