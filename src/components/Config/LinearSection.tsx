import { KanbanSquare, Loader2, AlertCircle } from "lucide-react";
import { useLinearTeams } from "../../hooks/useLinear";
import { useSettingsStore } from "../../stores/settingsStore";
import { TeamChecklist } from "../shared/TeamChecklist";

export function LinearSection() {
  const config = useSettingsStore((s) => s.config);
  const setConfig = useSettingsStore((s) => s.setConfig);
  const { data: teams, isLoading, error } = useLinearTeams();

  const selectedKeys = config.linear.teamIds;

  function toggleTeam(key: string) {
    const next = selectedKeys.includes(key)
      ? selectedKeys.filter((k) => k !== key)
      : [...selectedKeys, key];
    setConfig({ ...config, linear: { ...config.linear, teamIds: next } });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Linear
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Select which Linear teams appear on the board.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <KanbanSquare className="size-4 text-[var(--accent-blue)]" />
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            Teams
          </h2>
          {selectedKeys.length > 0 && (
            <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
              {selectedKeys.length} selected
            </span>
          )}
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
      </section>
    </div>
  );
}
