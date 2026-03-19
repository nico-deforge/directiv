import { Terminal } from "lucide-react";

export function WtSetupInstructions() {
  return (
    <div className="mt-3 space-y-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
        <Terminal className="size-3" />
        Setup in your terminal
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--text-muted)]/20 text-[9px] font-medium text-[var(--text-muted)]">
            1
          </span>
          <code className="text-xs text-[var(--text-secondary)]">
            brew install worktrunk
          </code>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--text-muted)]/20 text-[9px] font-medium text-[var(--text-muted)]">
            2
          </span>
          <code className="text-xs text-[var(--text-secondary)]">
            wt config shell install
          </code>
        </div>
      </div>
    </div>
  );
}
