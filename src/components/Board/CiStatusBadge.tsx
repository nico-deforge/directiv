import { WT_CI_STATUSES, type WtCiStatus } from "../../types";

const CI_BADGE_CONFIG: Record<
  WtCiStatus,
  { label: string; className: string }
> = {
  [WT_CI_STATUSES.PASSED]: {
    label: "CI",
    className: "bg-[var(--accent-green)]/20 text-[var(--accent-green)]",
  },
  [WT_CI_STATUSES.RUNNING]: {
    label: "CI",
    className: "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]",
  },
  [WT_CI_STATUSES.FAILED]: {
    label: "CI",
    className: "bg-[var(--accent-red)]/20 text-[var(--accent-red)]",
  },
  [WT_CI_STATUSES.CONFLICTS]: {
    label: "CI",
    className: "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]",
  },
  [WT_CI_STATUSES.NO_CI]: {
    label: "CI",
    className: "bg-neutral-500/20 text-[var(--text-muted)]",
  },
  [WT_CI_STATUSES.ERROR]: {
    label: "CI",
    className: "bg-[var(--accent-red)]/20 text-[var(--accent-red)]",
  },
};

const CI_TOOLTIP: Record<WtCiStatus, string> = {
  [WT_CI_STATUSES.PASSED]: "CI passed",
  [WT_CI_STATUSES.RUNNING]: "CI running",
  [WT_CI_STATUSES.FAILED]: "CI failed",
  [WT_CI_STATUSES.CONFLICTS]: "Merge conflicts",
  [WT_CI_STATUSES.NO_CI]: "No CI",
  [WT_CI_STATUSES.ERROR]: "CI error",
};

export function CiStatusBadge({
  status,
  url,
  stale,
}: {
  status: WtCiStatus;
  url?: string | null;
  stale?: boolean | null;
}) {
  const config =
    CI_BADGE_CONFIG[status] ?? CI_BADGE_CONFIG[WT_CI_STATUSES.ERROR];
  const tooltip = CI_TOOLTIP[status] ?? "CI unknown";

  const badge = (
    <span
      title={stale ? `${tooltip} (stale)` : tooltip}
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${config.className} ${stale ? "opacity-50" : ""}`}
    >
      {config.label}
    </span>
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        {badge}
      </a>
    );
  }

  return <span className="shrink-0">{badge}</span>;
}
