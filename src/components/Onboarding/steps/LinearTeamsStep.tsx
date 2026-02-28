import { Loader2, AlertCircle } from "lucide-react";
import { useLinearTeams } from "../../../hooks/useLinear";
import { TeamChecklist } from "../../shared/TeamChecklist";

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

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-[var(--text-muted)]" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10 p-4">
          <AlertCircle className="size-4 shrink-0 text-[var(--accent-red)]" />
          <p className="text-sm text-[var(--accent-red)]">
            Failed to load teams: {error.message}
          </p>
        </div>
      )}

      {teams && (
        <TeamChecklist
          teams={teams}
          selectedKeys={selectedKeys}
          onToggle={toggleTeam}
        />
      )}
    </div>
  );
}
