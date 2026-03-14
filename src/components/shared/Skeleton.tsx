export function Skeleton({
  className = "",
  width,
  height,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--bg-tertiary)] ${className}`}
      style={{ width, height }}
    />
  );
}
