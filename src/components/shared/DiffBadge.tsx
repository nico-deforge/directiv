export function DiffBadge({
  added,
  deleted,
}: {
  added: number;
  deleted: number;
}) {
  if (added === 0 && deleted === 0) return null;
  return (
    <span
      className="flex items-center gap-0.5 text-[10px] font-medium"
      title="Uncommitted changes"
    >
      {added > 0 && (
        <span className="text-[var(--accent-green)]">+{added}</span>
      )}
      {deleted > 0 && (
        <span className="text-[var(--accent-red)]">-{deleted}</span>
      )}
    </span>
  );
}
